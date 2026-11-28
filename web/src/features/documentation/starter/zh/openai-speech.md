```bash
curl '{{API_BASE}}/v1/audio/speech' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen-audio-3.1-tts-next","input":"你好","response_format":"wav"}' \
  --output speech.wav
```

接口直接返回音频文件。更换模型时，请确认它支持的音色和输出格式。
