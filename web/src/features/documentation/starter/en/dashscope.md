```bash
curl '{{API_BASE}}/api/v1/services/aigc/multimodal-generation/generation' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"qwen-image-3.0-pro",
    "input":{"messages":[{"role":"user","content":[{"text":"A watercolor garden"}]}]},
    "parameters":{"size":"1024*1024","n":1}
  }'
```

For image editing, add an `{"image":"https://example.org/reference.png"}` item before the text item in `input.messages[0].content` and use an editing prompt.

Read the image URL from `output.choices[].message.content[].image`. Native size strings use an asterisk, as in `1024*1024`. See [Asynchronous image jobs](/docs/dashscope-async) for task submission and polling.
