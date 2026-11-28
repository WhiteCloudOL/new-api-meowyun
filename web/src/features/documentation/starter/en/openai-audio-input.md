## Transcribe an audio file

Upload audio to `POST /v1/audio/transcriptions` to return text in the original language.

```bash
curl '{{API_BASE}}/v1/audio/transcriptions' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -F 'model=TRANSCRIPTION_MODEL_ID' \
  -F 'file=@recording.wav'
```

### Request parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | `file` | Yes | Audio to transcribe |
| `model` | `string` | Yes | Enabled transcription model ID |
| `language` | `string` | No | Input language such as `zh` or `en`, if the model supports it |
| `prompt` | `string` | No | Context or vocabulary for the model, if supported |
| `response_format` | `string` | No | Output format. The example uses the default JSON response |

### Response

The JSON field `text` contains the transcription. Other output formats depend on the selected model.

```json response
{
  "text": "The meeting will start at two in the afternoon."
}
```

## Translate audio to English

Send `file` and a translation-capable `model` to `POST /v1/audio/translations` as `multipart/form-data`. The JSON field `text` contains the English translation.

```bash
curl '{{API_BASE}}/v1/audio/translations' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -F 'model=TRANSLATION_MODEL_ID' \
  -F 'file=@recording.wav'
```

The OpenAI SDK methods are `client.audio.transcriptions.create(...)` and `client.audio.translations.create(...)`.
