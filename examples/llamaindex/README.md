# LlamaIndex integration

This adapter exposes Industrial Platform paid utilities as LlamaIndex
`FunctionTool` objects.

```bash
python -m pip install -r requirements.txt
export EVM_PRIVATE_KEY=0x...
```

Use:

```python
from examples.llamaindex.industrial_platform_tools import TOOLS

# Pass TOOLS to your preferred LlamaIndex agent/workflow.
```

Tool calls are paid by the external caller's Base wallet only when the agent
actually invokes the protected route.
