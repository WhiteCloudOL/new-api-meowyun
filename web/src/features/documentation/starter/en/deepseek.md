```bash
curl '{{API_BASE}}/v1/tools/search' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"query":"Open source AI gateways","count":3}'

curl '{{API_BASE}}/v1/tools/fetch' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.org"}'
```

Keys with model restrictions need access to `deepseek-search` or `deepseek-fetch` for the respective operation.
