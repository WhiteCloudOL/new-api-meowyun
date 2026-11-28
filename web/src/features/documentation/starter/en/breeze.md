Send native form data to `POST /v1/audio/speech` for a PCM stream. Use a voice ID from the current gateway account's `GET /v1/voices` list.

```bash
curl '{{API_BASE}}/v1/audio/speech' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  --data-urlencode 'text=Hello' \
  --data-urlencode 'voice_id=YOUR_VOICE_ID' \
  --data-urlencode 'instruction=Speak gently' \
  --output speech.pcm
```

For OpenAI-format audio, send JSON to the same endpoint using `model: "breeze-tts-2"`, `input`, `voice` and a `response_format` such as `wav`.
