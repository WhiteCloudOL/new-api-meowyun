1. 在 [API 密钥](/keys) 创建网关密钥。
2. 在 [模型广场](/pricing) 选择模型，打开 **API** 页签查看支持的端点。
3. 选择客户端支持的协议。将 `NEW_API_KEY` 设为网关密钥，并把 `MODEL_ID` 替换成可用的模型 ID。

| 客户端         | Base URL              | 鉴权                                 |
| -------------- | --------------------- | ------------------------------------ |
| OpenAI SDK     | `{{API_BASE}}/v1`     | `Authorization: Bearer $NEW_API_KEY` |
| Anthropic SDK  | `{{API_BASE}}`        | `x-api-key: $NEW_API_KEY`            |
| Gemini REST    | `{{API_BASE}}/v1beta` | `x-goog-api-key: $NEW_API_KEY`       |
| DashScope REST | `{{API_BASE}}`        | `Authorization: Bearer $NEW_API_KEY` |

## 常用端点

| 用途                         | 方法与路径                                                     | 示例                                                                   |
| ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 文本对话、视觉理解、工具调用 | `POST /v1/chat/completions`                                    | [OpenAI Chat Completions](/docs/openai)                                |
| Responses 对话               | `POST /v1/responses`                                           | [Responses](/docs/openai-responses)                                    |
| 生成和编辑图片               | `POST /v1/images/generations`、`POST /v1/images/edits`         | [生成图片](/docs/openai-images) · [编辑图片](/docs/openai-image-edits) |
| 语音合成                     | `POST /v1/audio/speech`                                        | [语音合成](/docs/openai-speech) · [BreezeTTS 原生表单](/docs/breeze)   |
| 音频转写和翻译               | `POST /v1/audio/transcriptions`、`POST /v1/audio/translations` | [音频输入](/docs/openai-audio-input)                                   |
| 模型查询与文本向量           | `GET /v1/models`、`POST /v1/embeddings`                        | [模型和向量](/docs/openai-models)                                      |
| 视频异步生成                 | `POST /v1/videos`、`GET /v1/videos/{id}`                       | [视频生成](/docs/openai-videos)                                        |
| 网页搜索与抓取               | `POST /v1/tools/search`、`POST /v1/tools/fetch`                | [DeepSeek 网页工具](/docs/deepseek)                                    |

替换示例里的模型占位符前，先确认该模型的 API 页签列出了对应端点。可用模型还受到密钥分组和模型授权范围限制。
