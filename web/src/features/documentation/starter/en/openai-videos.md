Use an enabled model that lists the OpenAI-compatible video endpoint. Submit a prompt to `POST /v1/videos`.

```bash
curl '{{API_BASE}}/v1/videos' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"VIDEO_MODEL_ID","prompt":"A slow pan across a garden after rain"}'
```

| Method and path               | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `POST /v1/videos`             | Create an asynchronous video job                  |
| `GET /v1/videos/{id}`         | Poll the job using the ID returned by the gateway |
| `GET /v1/videos/{id}/content` | Download available video content after completion |

Use the same API key when polling and downloading. Size, duration, image references, and extension features depend on which video model is enabled.
