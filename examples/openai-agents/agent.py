import asyncio
import os
import shutil
import sys
from typing import Any

from agents import Agent, Runner
from agents.mcp import MCPServerStdio


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


def extract_tool_name(item: Any) -> str | None:
    resolved = getattr(item, "_resolved_tool_name", None)
    if isinstance(resolved, str) and resolved:
        return resolved

    raw = getattr(item, "raw_item", None)
    for candidate in (item, raw):
        if candidate is None:
            continue

        if isinstance(candidate, dict):
            for key in ("name", "tool_name"):
                value = candidate.get(key)
                if isinstance(value, str) and value:
                    return value
        else:
            for attr in ("name", "tool_name"):
                value = getattr(candidate, attr, None)
                if isinstance(value, str) and value:
                    return value

    return None


async def main() -> None:
    require_env("OPENAI_API_KEY")
    apify_token = require_env("APIFY_TOKEN")
    npx = find_npx()

    child_env = dict(os.environ)
    child_env["APIFY_TOKEN"] = apify_token

    prompt = " ".join(sys.argv[1:]).strip() or DEFAULT_PROMPT

    async with MCPServerStdio(
        name="Industrial Platform Research",
        params={
            "command": npx,
            "args": ["-y", "industrial-platform-research-mcp@0.1.1"],
            "env": child_env,
        },
        cache_tools_list=True,
        require_approval="never",
        use_structured_content=True,
    ) as server:
        agent_kwargs: dict[str, Any] = {}
        model = os.getenv("OPENAI_MODEL", "").strip()
        if model:
            agent_kwargs["model"] = model

        agent = Agent(
            name="Research Delegation Demo",
            instructions=AGENT_INSTRUCTIONS,
            mcp_servers=[server],
            **agent_kwargs,
        )

        result = await Runner.run(agent, prompt)

    tool_calls: list[str] = []
    for item in result.new_items:
        if getattr(item, "type", None) == "tool_call_item":
            name = extract_tool_name(item)
            tool_calls.append(name or "<unknown>")

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
    print(result.final_output)

    if not selected_research:
        raise SystemExit(
            "The agent did not autonomously select research_web for this prompt."
        )


if __name__ == "__main__":
    asyncio.run(main())
