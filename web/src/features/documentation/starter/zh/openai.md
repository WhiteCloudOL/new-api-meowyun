## 文本对话

使用 `POST /v1/chat/completions`，请求体为 JSON。`model` 填模型广场里的模型 ID，`messages` 按顺序传入对话历史。`system`、`developer` 等角色的可用性由所选模型决定。

```bash
curl '{{API_BASE}}/v1/chat/completions' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"deepseek-flash",
    "messages":[
      {"role":"system","content":"请用简体中文简洁回答"},
      {"role":"user","content":"解释一下什么是 SSE"}
    ]
  }'
```

正文在 `choices[0].message.content`。`choices[0].finish_reason` 表示结束原因，非流式响应可在 `usage` 中查看用量。使用 OpenAI SDK 时，Base URL 填 `{{API_BASE}}/v1`，调用 `client.chat.completions.create(...)`。

### SSE 流式输出

调用同一个端点，在 JSON 顶层加 `"stream": true`，用 `curl -N` 或 SDK 的迭代器读取事件。从每个数据块取 `choices[0].delta.content` 并按顺序拼接。收到 `data: [DONE]` 后结束。需要流式用量时，可在所选模型和渠道支持的情况下传 `"stream_options":{"include_usage":true}`。

## 图像输入（视觉理解）

同样调用 `POST /v1/chat/completions`，选用有视觉输入能力的模型。把用户消息的 `content` 写成数组，文本用 `type: "text"`，图像用 `type: "image_url"`，图片地址放在嵌套的 `image_url.url`。

```bash
curl '{{API_BASE}}/v1/chat/completions' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"VISION_MODEL_ID",
    "messages":[{
      "role":"user",
      "content":[
        {"type":"text","text":"描述这张图片"},
        {"type":"image_url","image_url":{"url":"https://example.org/photo.png"}}
      ]
    }]
  }'
```

将示例地址换成模型服务可以访问的公网图片，或填完整的数据 URL，例如 `data:image/png;base64,BASE64_DATA`。视觉理解的结果仍从 `choices[0].message.content` 读取。要输出一张新图片，请选择[图片生成](/docs/openai-images)。

## 工具调用

在顶层 `tools` 中声明函数的名称、描述和 JSON Schema。模型需要执行函数时，会在 `choices[0].message.tool_calls` 中返回调用 ID、函数名和参数。

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "查询城市当前天气",
        "parameters": {
          "type": "object",
          "properties": { "city": { "type": "string" } },
          "required": ["city"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

由客户端校验参数并执行函数。再把包含 `tool_calls` 的 assistant 消息和一条 `role: "tool"` 消息追加到历史中。工具消息的 `tool_call_id` 填模型返回的调用 ID，`content` 填执行结果，然后向同一个端点发出后续请求。
