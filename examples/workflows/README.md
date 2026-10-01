# Agent-to-agent workflow recipes

These examples are intentionally ordinary client workflows. They are meant for
external developers or autonomous agents using their own funded x402 wallets.

## SEO auditor

```bash
python examples/workflows/seo_auditor.py https://example.com/sitemap.xml
```

Flow:

```text
/web/sitemap-urls
  -> /web/robots-check
  -> /http/status
```

The script caps the sample to ten pages by default so a developer can inspect
spend before scaling it.

## Crypto intelligence

```bash
python examples/workflows/crypto_intelligence.py BTC-USD
```

Flow:

```text
/crypto/price
/crypto/stats
/crypto/book
```

The three market reads execute concurrently and return one combined JSON
dossier.
