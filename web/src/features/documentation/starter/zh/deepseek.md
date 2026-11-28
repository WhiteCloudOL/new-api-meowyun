```bash
curl '{{API_BASE}}/v1/tools/search' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"query":"开源 AI 网关","count":3}'

curl '{{API_BASE}}/v1/tools/fetch' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.org"}'
```

如果密钥启用了模型限制，请为搜索和抓取分别开放 `deepseek-search` 或 `deepseek-fetch`。
