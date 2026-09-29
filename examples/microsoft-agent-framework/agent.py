import asyncio
import os
import shutil
import sys
from typing import Any

from agent_framework import Agent, MCPStdioTool
from agent_framework.openai import OpenAIChatClient


DEFAULT_PROMPT = (
    "Compare the current pricing and enterprise security features of Notion, "
    "ClickUp, and Asana. Use current authoritative sources, cite them, and "
    "identify any important unresolved facts."
)

AGENT_INSTRUCTIONS = """
You are a general-purpose assistant with access to Industrial Platform Research.

Decide for yourself whether to use the research_web tool.

Use research_web when the user's request depends on current external facts,
multi-source research, pricing, vendor or competitor comparison, market or
technology research, or source-backed verification.

Do not use research_web for timeless common knowledge, arithmetic, casual
conversation, or writing-only tasks that do not require current evidence.

When research_web is appropriate, delegate the research question with enough
context and requirements for the research service to return a useful cited
brief. Then use that result to answer the user.
""".strip()


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(
            f"{name} is not set. Configure it in your environment before running this example."
        )
    return value


def find_npx() -> str:
    command = shutil.which("npx.cmd") or shutil.which("npx")
    if not command:
        raise RuntimeError(
            "npx was not found. Install Node.js 20+ and ensure npm/npx are on PATH."
        )
    return command


def extract_tool_calls(response: Any) -> list[str]:
    names: list[str] = []
    messages = getattr(response, "messages", None) or []

    for message in messages:
        contents = getattr(message, "contents", None) or []
        for content in contents:
            content_type = getattr(content, "type", None)

            if isinstance(content, dict):
                content_type = content.get("type")
                name = content.get("name")
            else:
                name = getattr(content, "name", None)

            if content_type == "function_call" and isinstance(name, str) and name:
                names.append(name)

    return names


async def main() -> None:
    require_env("OPENAI_API_KEY")
    apify_token = require_env("APIFY_TOKEN")
    npx = find_npx()

    child_env = dict(os.environ)
    child_env["APIFY_TOKEN"] = apify_token

    prompt = " ".join(sys.argv[1:]).strip() or DEFAULT_PROMPT

    model = os.getenv("OPENAI_CHAT_MODEL", "").strip()
    client = OpenAIChatClient(model=model) if model else OpenAIChatClient()

    async with MCPStdioTool(
        name="Industrial Platform Research",
        command=npx,
        args=["-y", "industrial-platform-research-mcp@0.1.2"],
        env=child_env,
        approval_mode="never_require",
    ) as research_mcp:
        agent = Agent(
            client=client,
            name="ResearchDelegationDemo",
            instructions=AGENT_INSTRUCTIONS,
            tools=research_mcp,
        )

        result = await agent.run(prompt)

    tool_calls = extract_tool_calls(result)
    selected_research = "research_web" in tool_calls

    print("\n=== Autonomous tool-selection validation ===")
    print(f"Prompt: {prompt}")
    print("Tool choice forced: no")
    print(f"Tool calls observed: {tool_calls or ['<none>']}")
    print(
        "AUTONOMOUS_TOOL_SELECTION: "
        + ("PASS" if selected_research else "FAIL")
    )
    print("\n=== Final agent output ===")
    print(result.text)

    if not selected_research:
        raise SystemExit(
            "The agent did not autonomously select research_web for this prompt."
        )


if __name__ == "__main__":
    asyncio.run(main())
