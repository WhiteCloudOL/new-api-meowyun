```bash
curl '{{API_BASE}}/v1/responses' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_ID","input":"简要介绍温室效应"}'
```

选择标明支持 Responses 的模型。OpenAI SDK 的方法是 `client.responses.create(...)`，可直接读 `response.output_text`。直接调用 HTTP 时，遍历 `output` 里的消息，从 `content` 中读取 `type: "output_text"` 的 `text`。

## 流式与图像输入

- 流式请求在顶层设置 `"stream": true`。从 `response.output_text.delta` 事件的 `delta` 拼接正文，按 `response.completed`、`response.failed` 等终态处理结果。
- 图像输入使用 `input` 消息的 `content` 数组。文本部分写 `{"type":"input_text","text":"描述这张图片"}`，图像部分写 `{"type":"input_image","image_url":"https://example.org/photo.png"}`。模型需同时支持 Responses 和视觉输入。
- 支持后台任务的模型可用 `background: true` 提交，使用响应 `id` 请求 `GET /v1/responses/{id}` 查询。具体支持情况见该模型的 API 页签。
