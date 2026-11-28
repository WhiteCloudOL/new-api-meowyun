```bash
curl '{{API_BASE}}/v1/audio/speech' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen-audio-3.1-tts-next","input":"Hello","response_format":"wav"}' \
  --output speech.wav
```

The API returns audio bytes. Check the model's supported voices and output formats when switching models.
