```bash
curl '{{API_BASE}}/v1beta/models/MODEL_ID:generateContent' \
  -H "x-goog-api-key: $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"role":"user","parts":[{"text":"Hello"}]}]}'
```

Read `candidates[0].content.parts`. The model ID goes in the URL.
