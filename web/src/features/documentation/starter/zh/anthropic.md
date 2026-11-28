```bash
curl '{{API_BASE}}/v1/messages' \
  -H "x-api-key: $NEW_API_KEY" \
  -H 'anthropic-version: 2023-06-01' \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_ID","max_tokens":256,"messages":[{"role":"user","content":"你好"}]}'
```

从 `content` 中读取文本块。Anthropic SDK 的 Base URL 填站点地址，SDK 会拼接 `/v1/messages`。
