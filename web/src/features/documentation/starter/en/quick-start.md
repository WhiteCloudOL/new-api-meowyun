1. Create a key in [API Keys](/keys).
2. Find a model in the [Model Square](/pricing) and check its **API** tab for supported endpoints.
3. Choose the protocol your application can send. Set `NEW_API_KEY` to your gateway key and replace `MODEL_ID` with an available model ID.

| Client         | Base URL              | Authentication                       |
| -------------- | --------------------- | ------------------------------------ |
| OpenAI SDK     | `{{API_BASE}}/v1`     | `Authorization: Bearer $NEW_API_KEY` |
| Anthropic SDK  | `{{API_BASE}}`        | `x-api-key: $NEW_API_KEY`            |
| Gemini REST    | `{{API_BASE}}/v1beta` | `x-goog-api-key: $NEW_API_KEY`       |
| DashScope REST | `{{API_BASE}}`        | `Authorization: Bearer $NEW_API_KEY` |

## Common endpoints

| Use case                            | Method and path                                                | Examples                                                                |
| ----------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Chat, vision, and tools             | `POST /v1/chat/completions`                                    | [OpenAI Chat Completions](/docs/openai)                                 |
| Responses                           | `POST /v1/responses`                                           | [Responses](/docs/openai-responses)                                     |
| Generate or edit images             | `POST /v1/images/generations`, `POST /v1/images/edits`         | [Generation](/docs/openai-images) · [Editing](/docs/openai-image-edits) |
| Speech synthesis                    | `POST /v1/audio/speech`                                        | [Speech](/docs/openai-speech) · [BreezeTTS native form](/docs/breeze)   |
| Transcribe or translate audio       | `POST /v1/audio/transcriptions`, `POST /v1/audio/translations` | [Audio input](/docs/openai-audio-input)                                 |
| List models and generate embeddings | `GET /v1/models`, `POST /v1/embeddings`                        | [Models and embeddings](/docs/openai-models)                            |
| Generate videos                     | `POST /v1/videos`, `GET /v1/videos/{id}`                       | [Video generation](/docs/openai-videos)                                 |
| Search and fetch web pages          | `POST /v1/tools/search`, `POST /v1/tools/fetch`                | [DeepSeek web tools](/docs/deepseek)                                    |

Check the model's API tab before substituting a model ID in an example. Your key's group and model restrictions determine which models you can call.
