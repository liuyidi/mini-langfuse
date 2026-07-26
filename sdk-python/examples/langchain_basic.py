"""Example: LangChain integration with Mini Langfuse (M22).

Prerequisites:
    pip install langchain langchain-openai mini-langfuse-server

Usage:
    export OPENAI_API_KEY=sk-...
    python examples/langchain_basic.py
"""
import os
import sys

# Add parent directory to path for local development
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from mini_langfuse.integrations.langchain import MiniLangfuseCallbackHandler


def main():
    """Demonstrate LangChain integration."""

    # Create the callback handler
    handler = MiniLangfuseCallbackHandler(
        public_key="pk-lf-demo",
        secret_key="sk-lf-demo",
        host="http://localhost:8000",
    )

    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser
    except ImportError:
        print("Install LangChain: pip install langchain langchain-openai")
        return

    # Create LLM with Mini Langfuse callback
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0.7,
        callbacks=[handler],
    )

    # Create a simple chain
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant. Answer in one sentence."),
        ("human", "{input}"),
    ])
    chain = prompt | llm | StrOutputParser()

    # Run the chain — traces are automatically captured
    print("Running LangChain chain with Mini Langfuse tracing...")
    result = chain.invoke(
        {"input": "What is the capital of France?"},
        config={"callbacks": [handler]},
    )
    print(f"Result: {result}")

    # Flush to ensure all events are sent
    handler.flush()
    print("\nDone! Check http://localhost:8080 for traces.")


if __name__ == "__main__":
    main()
