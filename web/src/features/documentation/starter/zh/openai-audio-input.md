## 音频转写

向 `POST /v1/audio/transcriptions` 上传音频，返回原语言的转写文本。

```bash
curl '{{API_BASE}}/v1/audio/transcriptions' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -F 'model=TRANSCRIPTION_MODEL_ID' \
  -F 'file=@recording.wav'
```

### 请求参数

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | 文件 | 是 | 要转写的音频文件 |
| `model` | `string` | 是 | 已启用的转写模型 ID |
| `language` | `string` | 否 | 输入音频的语言，例如 `zh` 或 `en`，以模型支持情况为准 |
| `prompt` | `string` | 否 | 为模型提供上下文或专有名词，需模型支持 |
| `response_format` | `string` | 否 | 返回格式，示例使用默认 JSON |

### 响应

JSON 响应中的 `text` 为转写结果。使用其他返回格式时，以模型支持的格式为准。

```json response
{
  "text": "会议将在下午两点开始。"
}
```

## 音频翻译成英文

使用 `POST /v1/audio/translations`，同样以 `multipart/form-data` 提交 `file` 和支持翻译的 `model`。JSON 响应的 `text` 为英文译文。

```bash
curl '{{API_BASE}}/v1/audio/translations' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -F 'model=TRANSLATION_MODEL_ID' \
  -F 'file=@recording.wav'
```

OpenAI SDK 对应方法为 `client.audio.transcriptions.create(...)` 和 `client.audio.translations.create(...)`。
