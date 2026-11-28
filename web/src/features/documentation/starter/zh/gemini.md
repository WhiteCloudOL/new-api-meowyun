```bash
curl '{{API_BASE}}/v1beta/models/MODEL_ID:generateContent' \
  -H "x-goog-api-key: $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"role":"user","parts":[{"text":"你好"}]}]}'
```

从 `candidates[0].content.parts` 读取结果。模型 ID 填在 URL 里。
