```bash
curl '{{API_BASE}}/api/v1/services/aigc/multimodal-generation/generation' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"qwen-image-3.0-pro",
    "input":{"messages":[{"role":"user","content":[{"text":"一座水彩风格的庭院"}]}]},
    "parameters":{"size":"1024*1024","n":1}
  }'
```

编辑图片时，在 `input.messages[0].content` 的文本项前添加 `{"image":"https://example.org/reference.png"}`，并将文本改为编辑指令。

同步结果的图片地址可以从 `output.choices[].message.content[].image` 读取。指定尺寸时，百炼原生格式是 `1024*1024`。异步调用请参见[异步图片任务](/docs/dashscope-async)。
