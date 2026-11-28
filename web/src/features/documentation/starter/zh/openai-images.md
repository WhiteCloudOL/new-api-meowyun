## OpenAI Images API

**`POST /v1/images/generations`** 与 OpenAI 官方 Images API 使用相同的路径和请求结构。OpenAI SDK 的 Base URL 填 `{{API_BASE}}/v1`，调用 `client.images.generate(...)`。

```bash
curl '{{API_BASE}}/v1/images/generations' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"gpt-image-2",
    "prompt":"雨后的日式庭院，水彩插画",
    "size":"1024x1024",
    "n":1
  }'
```

| 字段                       | 说明                                     |
| -------------------------- | ---------------------------------------- |
| `model`                    | OpenAI 图片模型 ID，以模型广场可用项为准 |
| `prompt`                   | 描述要生成的画面                         |
| `size`                     | 尺寸，例如 `1024x1024`。有效值因模型而异 |
| `n`                        | 生成张数，具体限制以模型能力为准         |
| `quality`、`output_format` | 可选的质量和输出编码，按模型支持情况填写 |

GPT Image 的图片数据通常在 `data[0].b64_json`，Base64 解码后保存为图片文件。客户端也可兼容返回 `data[0].url` 的渠道，但读取 GPT Image 时不要依赖 URL。请求 GPT Image 时可以省略 `response_format`。

## 百炼模型的 OpenAI 兼容调用

将相同请求中的 `model` 改成 `qwen-image-3.0-pro` 等已启用的 Qwen Image 模型即可通过兼容端点调用。该类模型的兼容响应默认在 `data[0].url` 返回图片地址。使用百炼原生参数时，参见[百炼 DashScope 原生接口](/docs/dashscope)。
