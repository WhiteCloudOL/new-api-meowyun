在模型广场选择标明支持 OpenAI 兼容视频端点的模型，向 `POST /v1/videos` 提交提示词。

```bash
curl '{{API_BASE}}/v1/videos' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"VIDEO_MODEL_ID","prompt":"镜头缓缓掠过雨后的庭院"}'
```

| 方法与路径                    | 用途                           |
| ----------------------------- | ------------------------------ |
| `POST /v1/videos`             | 创建异步视频任务               |
| `GET /v1/videos/{id}`         | 使用网关返回的任务 ID 查询状态 |
| `GET /v1/videos/{id}/content` | 任务完成后下载可用的视频内容   |

查询和下载沿用同一把 API 密钥。分辨率、时长、参考图和扩展参数按所选视频模型的能力填写。
