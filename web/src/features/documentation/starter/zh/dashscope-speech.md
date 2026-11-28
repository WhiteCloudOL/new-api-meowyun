```bash
curl '{{API_BASE}}/api/v1/services/audio/tts/SpeechSynthesizer' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen-audio-3.1-tts-next","input":{"text_prompt":"你好","format":"wav"}}'
```
