"""Evaluation execution service (M-Eval).

Runs LLM-as-a-judge evaluations against traces:
1. Find traces matching filters
2. For each trace, build an evaluation prompt from the trace data
3. Call the LLM to produce a score
4. Parse the score from the LLM response
5. Store the result
"""
from __future__ import annotations

import json
import logging
import re
import secrets
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, func as sqlfunc
from sqlalchemy.orm import Session

from ..models import EvaluationResult, EvaluationRun, Evaluator, Observation, Trace
from .llm_proxy import call as llm_call, LLMError

log = logging.getLogger("mini_langfuse.eval")

DEFAULT_JUDGE_PROMPT = """You are an evaluator. Your job is to assess the quality of an AI conversation trace.

Given the following trace data, rate it on a scale from {score_min} to {score_max}.

Trace name: {trace_name}
User: {user_id}

Conversation:
{conversation}

Output ONLY a JSON object with two fields:
- "score": a number between {score_min} and {score_max}
- "reasoning": a brief explanation of your rating (1-2 sentences)

Example output:
{{"score": 4, "reasoning": "The response was helpful and accurate, though it could have been more concise."}}"""


def _build_conversation_text(observations: list[Observation]) -> str:
    """Build a readable conversation text from observations."""
    lines = []
    for obs in sorted(observations, key=lambda o: o.start_time):
        if obs.type == "GENERATION":
            inp = _format_value(obs.input)
            out = _format_value(obs.output)
            if inp:
                lines.append(f"[User/Request]: {inp}")
            if out:
                lines.append(f"[AI Response]: {out}")
        elif obs.type == "SPAN":
            inp = _format_value(obs.input)
            out = _format_value(obs.output)
            if inp or out:
                lines.append(f"[{obs.name or 'Span'}] Input: {inp or '—'} → Output: {out or '—'}")
    return "\n".join(lines) if lines else "(empty trace)"


def _format_value(val: Any) -> str:
    """Format a value for display in the evaluation prompt."""
    if val is None:
        return ""
    if isinstance(val, str):
        return val[:2000]  # Truncate long strings
    if isinstance(val, list):
        # Chat messages format
        parts = []
        for msg in val[:10]:  # Limit to 10 messages
            if isinstance(msg, dict):
                role = msg.get("role", "")
                content = msg.get("content", "")
                if isinstance(content, str):
                    content = content[:500]
                parts.append(f"{role}: {content}")
            else:
                parts.append(str(msg)[:200])
        return "\n".join(parts)
    if isinstance(val, dict):
        return json.dumps(val, ensure_ascii=False, default=str)[:1000]
    return str(val)[:500]


def _extract_score(llm_response: str, score_min: float = 0, score_max: float = 5) -> dict:
    """Extract score and reasoning from the LLM response.

    Tries JSON parsing first, then falls back to regex.
    """
    result = {"score": None, "reasoning": None}

    # Try to find JSON in the response
    try:
        # Try to find JSON object in the text
        json_match = re.search(r'\{[^{}]*"score"\s*:\s*\d+[^{}]*\}', llm_response)
        if json_match:
            data = json.loads(json_match.group())
            score = float(data.get("score", data.get("Score", 0)))
            # Clamp to valid range
            score = max(score_min, min(score_max, score))
            result["score"] = score
            result["reasoning"] = data.get("reasoning", data.get("Reasoning", ""))
            return result
    except (json.JSONDecodeError, ValueError, TypeError):
        pass

    # Fallback: try to find a number in the response
    try:
        # Look for patterns like "score: 4" or "Rating: 4/5" or just "4"
        number_match = re.search(r'(?:score|rating|score[:\s]+)(\d+(?:\.\d+)?)', llm_response, re.IGNORECASE)
        if number_match:
            score = float(number_match.group(1))
            score = max(score_min, min(score_max, score))
            result["score"] = score
            result["reasoning"] = llm_response[:200]
            return result
    except (ValueError, TypeError):
        pass

    return result


def _run_single_evaluation(
    db: Session,
    result: EvaluationResult,
    evaluator: Evaluator,
    trace: Trace,
    observations: list[Observation],
) -> None:
    """Run a single evaluation for one trace."""
    config = evaluator.config or {}
    score_min = config.get("score_min", 0)
    score_max = config.get("score_max", 5)
    prompt_template = config.get("prompt_template", DEFAULT_JUDGE_PROMPT)

    # Build the conversation text
    conversation = _build_conversation_text(observations)

    # Build the prompt
    prompt_text = prompt_template.format(
        score_min=score_min,
        score_max=score_max,
        trace_name=trace.name or "(unnamed)",
        user_id=trace.user_id or "(unknown)",
        conversation=conversation,
    )

    # Call the LLM
    model = config.get("model", "gpt-4o-mini")
    provider = config.get("provider", "mock")
    temperature = config.get("temperature", 0.0)

    messages = [
        {"role": "user", "content": prompt_text},
    ]

    try:
        response = llm_call(
            provider=provider,
            model=model,
            messages=messages,
            params={"temperature": temperature, "max_tokens": 512},
        )
        content = response.get("content", "")

        # Extract score from the response
        extracted = _extract_score(content, score_min, score_max)

        result.score_value = extracted["score"]
        result.reasoning = extracted["reasoning"]
        result.raw_response = {"content": content, "usage": response.get("usage")}
        result.status = "completed"

    except LLMError as e:
        result.status = "failed"
        result.error_message = str(e)
        log.warning("Evaluation failed for trace %s: %s", trace.id, e)
    except Exception as e:
        result.status = "failed"
        result.error_message = f"{type(e).__name__}: {e}"
        log.exception("Unexpected error evaluating trace %s", trace.id)


def _update_run_stats(db: Session, run: EvaluationRun) -> None:
    """Update the run's summary statistics."""
    results = db.execute(
        select(EvaluationResult).where(EvaluationResult.run_id == run.id)
    ).scalars().all()

    completed = [r for r in results if r.status == "completed" and r.score_value is not None]
    failed = [r for r in results if r.status == "failed"]

    run.completed_traces = len(completed)
    run.failed_traces = len(failed)

    if completed:
        scores = [r.score_value for r in completed]
        run.avg_score = round(sum(scores) / len(scores), 4)

        # Build score distribution
        dist: dict[str, int] = {}
        for s in scores:
            key = str(int(s)) if s == int(s) else str(round(s, 1))
            dist[key] = dist.get(key, 0) + 1
        run.score_distribution = dist


def execute_evaluation_run(run_id: str, db_session_factory) -> None:
    """Execute an evaluation run in a background thread.

    This is the main entry point for running evaluations.
    Called from the API after creating a run.
    """
    db = db_session_factory()
    try:
        run = db.get(EvaluationRun, run_id)
        if not run or run.status != "pending":
            return

        evaluator = db.get(Evaluator, run.evaluator_id)
        if not evaluator:
            run.status = "failed"
            run.error_message = "Evaluator not found"
            db.commit()
            return

        # Update status to running
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        db.commit()

        # Find traces to evaluate based on filters
        filters = run.filters or {}
        conditions = [Trace.project_id == run.project_id]

        if filters.get("name"):
            conditions.append(Trace.name == filters["name"])
        if filters.get("userId"):
            conditions.append(Trace.user_id == filters["userId"])
        if filters.get("fromTimestamp"):
            conditions.append(Trace.timestamp >= datetime.fromisoformat(filters["fromTimestamp"]))
        if filters.get("toTimestamp"):
            conditions.append(Trace.timestamp <= datetime.fromisoformat(filters["toTimestamp"]))
        if filters.get("tags"):
            # Simple tag filter - would need JSON functions for full support
            pass

        traces = db.execute(
            select(Trace)
            .where(*conditions)
            .order_by(Trace.timestamp.desc())
            .limit(filters.get("limit", 100))
        ).scalars().all()

        run.total_traces = len(traces)
        db.commit()

        if not traces:
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
            return

        # Create result records and evaluate each trace
        for trace in traces:
            result = EvaluationResult(
                id=f"eval_{secrets.token_urlsafe(12)}",
                run_id=run.id,
                trace_id=trace.id,
                evaluator_id=evaluator.id,
                status="pending",
            )
            db.add(result)
            db.flush()  # Get the ID

            # Get observations for this trace
            observations = db.execute(
                select(Observation).where(Observation.trace_id == trace.id)
            ).scalars().all()

            _run_single_evaluation(db, result, evaluator, trace, observations)
            db.commit()

            # Update run stats after each trace
            _update_run_stats(db, run)
            db.commit()

        # Mark run as completed
        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
        db.commit()
        log.info("Evaluation run %s completed: %d traces evaluated", run_id, run.total_traces)

    except Exception as e:
        log.exception("Evaluation run %s failed", run_id)
        try:
            run = db.get(EvaluationRun, run_id)
            if run:
                run.status = "failed"
                run.error_message = str(e)
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def start_evaluation_async(run_id: str, db_session_factory) -> None:
    """Start an evaluation run in a background thread."""
    thread = threading.Thread(
        target=execute_evaluation_run,
        args=(run_id, db_session_factory),
        daemon=True,
        name=f"eval-{run_id[:8]}",
    )
    thread.start()
