## OpenAI Images API

**`POST /v1/images/generations`** uses the same route and request structure as the OpenAI Images API. Set the OpenAI SDK base URL to `{{API_BASE}}/v1` and call `client.images.generate(...)`.

```bash
curl '{{API_BASE}}/v1/images/generations' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"gpt-image-2",
    "prompt":"A Japanese garden after rain, painted in watercolor",
    "size":"1024x1024",
    "n":1
  }'
```

| Field                      | Purpose                                                  |
| -------------------------- | -------------------------------------------------------- |
| `model`                    | An available OpenAI image model ID from the Model Square |
| `prompt`                   | The scene to generate                                    |
| `size`                     | Dimensions such as `1024x1024`, subject to model support |
| `n`                        | Number of images, subject to model limits                |
| `quality`, `output_format` | Optional quality and encoding settings, when supported   |

GPT Image normally returns image bytes as Base64 in `data[0].b64_json`. Decode it before saving the image. Some compatible channels return `data[0].url`. GPT Image requests can omit `response_format`.

## Qwen Image using the OpenAI-compatible API

Change `model` in the same request to an enabled Qwen Image model such as `qwen-image-3.0-pro`. These models typically return a URL in `data[0].url` through the compatibility API. For native fields, see the [DashScope native API](/docs/dashscope).
