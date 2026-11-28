```bash
curl '{{API_BASE}}/v1/messages' \
  -H "x-api-key: $NEW_API_KEY" \
  -H 'anthropic-version: 2023-06-01' \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_ID","max_tokens":256,"messages":[{"role":"user","content":"Hello"}]}'
```

Read the text blocks in `content`. Give the Anthropic SDK the site origin as its base URL. It adds `/v1/messages`.
