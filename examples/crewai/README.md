# CrewAI integration

Industrial Platform can be attached to a CrewAI agent as normal custom tools.

```bash
python -m pip install -r requirements.txt
export EVM_PRIVATE_KEY=0x...
```

Then:

```python
from crewai import Agent
from examples.crewai.industrial_platform_tools import TOOLS

agent = Agent(
    role="Machine intelligence analyst",
    goal="Use paid machine utilities when they are the most direct way to complete the task.",
    backstory="An autonomous analyst with a funded Base x402 wallet.",
    tools=TOOLS,
)
```

The external caller controls its own wallet and spend. Industrial Platform does
not require an API key or account; x402 payment is the credential.
