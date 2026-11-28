## Text chat

Send JSON to `POST /v1/chat/completions`. Set `model` to an ID listed in the Model Square and pass your conversation history in `messages`. Supported message roles vary by model.

```bash
curl '{{API_BASE}}/v1/chat/completions' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"deepseek-flash",
    "messages":[
      {"role":"system","content":"Give concise answers"},
      {"role":"user","content":"What is SSE?"}
    ]
  }'
```

Read `choices[0].message.content`. `choices[0].finish_reason` gives the termination reason, and `usage` reports usage when available. In the OpenAI SDK, set the base URL to `{{API_BASE}}/v1` and call `client.chat.completions.create(...)`.

### Streaming with SSE

Set `"stream": true` in the same request and use `curl -N` or the SDK iterator. Append `choices[0].delta.content` from each chunk in arrival order and finish when you receive `data: [DONE]`. Some models and channels accept `"stream_options":{"include_usage":true}` for streamed usage information.

## Image input (vision)

Use the same endpoint with a vision-capable model. Send an array for the user message's `content`. Use `type: "text"` for the prompt and `type: "image_url"` with a nested `image_url.url` for the image.

```bash
curl '{{API_BASE}}/v1/chat/completions' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"VISION_MODEL_ID",
    "messages":[{
      "role":"user",
      "content":[
        {"type":"text","text":"Describe this image"},
        {"type":"image_url","image_url":{"url":"https://example.org/photo.png"}}
      ]
    }]
  }'
```

Use an HTTP(S) image the model provider can reach, or a full data URL such as `data:image/png;base64,BASE64_DATA`. Read the analysis from `choices[0].message.content`. To create an image, use [Image Generation](/docs/openai-images).

## Function calling

Define the function's name, description and JSON Schema in the top-level `tools` array. The model returns the call ID, function name and arguments in `choices[0].message.tool_calls`.

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather for a city",
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

Validate and execute the function in your application. Append the assistant message containing `tool_calls` and a `role: "tool"` message with the returned `tool_call_id` and your result in `content`. Send the updated history to the same endpoint.
