"""Prompt fetched from the server, with local variable substitution."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional


_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


def _substitute(text: str, variables: dict[str, Any]) -> str:
    def replace(m: re.Match) -> str:
        key = m.group(1)
        if key in variables:
            return str(variables[key])
        return m.group(0)  # leave `{{missing}}` in place
    return _VAR_RE.sub(replace, text)


@dataclass
class PromptClient:
    """A resolved prompt version, plus helpers.

    Access:
        p = client.get_prompt("welcome", label="production")
        p.version           # int
        p.id                # str  (pass as prompt_version_id when logging generations)
        p.type              # "text" or "chat"
        p.raw_content       # the stored content (str or list of chat messages)
        p.compile(name="Alice")  # substitutes {{name}} everywhere
    """

    id: str
    name: str
    version: int
    type: str
    raw_content: Any
    labels: Optional[list[str]] = None
    config: Optional[Any] = None

    def compile(self, **variables: Any) -> Any:
        """Substitute {{var}} placeholders in the prompt content."""
        if self.type == "text":
            return _substitute(str(self.raw_content), variables)
        if self.type == "chat":
            out = []
            for msg in self.raw_content or []:
                new_msg = dict(msg)
                if isinstance(new_msg.get("content"), str):
                    new_msg["content"] = _substitute(new_msg["content"], variables)
                out.append(new_msg)
            return out
        return self.raw_content
