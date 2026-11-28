向 `POST /v1/audio/speech` 提交原生表单可获取 PCM 音频流。音色 ID 可通过当前网关账号的 `GET /v1/voices` 获取。

```bash
curl '{{API_BASE}}/v1/audio/speech' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  --data-urlencode 'text=你好' \
  --data-urlencode 'voice_id=YOUR_VOICE_ID' \
  --data-urlencode 'instruction=语气轻柔' \
  --output speech.pcm
```

OpenAI 兼容形式使用同一个端点，发送包含 `model: "breeze-tts-2"`、`input`、`voice` 和 `response_format` 的 JSON，例如指定 `wav` 输出。
