将相同的 JSON 提交到 `POST /api/v1/services/aigc/image-generation/generation`，并加上 `X-DashScope-Async: enable` 请求头。取响应中的 `output.task_id`，用同一把网关密钥轮询 `GET /api/v1/tasks/{task_id}`。`output.task_status` 变为 `SUCCEEDED` 后即可读取图片。

```bash
curl "{{API_BASE}}/api/v1/tasks/$TASK_ID" \
  -H "Authorization: Bearer $NEW_API_KEY"
```

`PENDING` 或 `RUNNING` 时可延迟几秒再查询。`FAILED` 时检查 `output.code` 和 `output.message`。
