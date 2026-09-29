# Web Change Intelligence example

After `industrial_platform/web-change-intelligence` is deployed, set `APIFY_TOKEN` and run:

```bash
node ./examples/web-change/check.mjs
```

The first request captures a baseline. Reuse the returned `current_hash` for a compact later check, or `current_text` for a detailed diff.
