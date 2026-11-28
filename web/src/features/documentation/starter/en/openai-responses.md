```bash
curl '{{API_BASE}}/v1/responses' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_ID","input":"Summarize the greenhouse effect"}'
```

Select a model that lists the Responses endpoint. In the OpenAI SDK, call `client.responses.create(...)` and read `response.output_text`. In raw HTTP, read `text` from the `output_text` content items in the `output` messages.

## Streaming and image input

- Set `"stream": true` at the top level. Append `delta` from `response.output_text.delta` events and handle terminal events such as `response.completed` and `response.failed`.
- For vision-capable models, send a message in `input` with a `content` array that contains `{"type":"input_text","text":"Describe this image"}` and `{"type":"input_image","image_url":"https://example.org/photo.png"}`.
- Models with background support accept `background: true`. Query `GET /v1/responses/{id}` with the returned ID. Check the model's API tab for support.
