Submit the same JSON to `POST /api/v1/services/aigc/image-generation/generation` with `X-DashScope-Async: enable`. Use the returned `output.task_id` to poll `GET /api/v1/tasks/{task_id}` with the same gateway key. Read the image from the result when `output.task_status` is `SUCCEEDED`.

```bash
curl "{{API_BASE}}/api/v1/tasks/$TASK_ID" \
  -H "Authorization: Bearer $NEW_API_KEY"
```

Wait a few seconds before polling again for `PENDING` or `RUNNING`. For `FAILED`, check `output.code` and `output.message`.
