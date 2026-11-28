## 编辑本地图片

向 **`POST /v1/images/edits`** 提交 `multipart/form-data`。OpenAI SDK 对应 `client.images.edit(...)`。

```bash
curl '{{API_BASE}}/v1/images/edits' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -F 'model=gpt-image-2' \
  -F 'image[]=@reference.png' \
  -F 'prompt=保留主体构图，把背景改成日落时的海边'
```

单张参考图可用 `image` 或 `image[]` 字段。支持多张参考图的模型可重复 `image[]`。使用 `curl -F` 时，curl 会自动写入带 boundary 的 `Content-Type`。想限制编辑区域时，查看当前模型是否支持 `mask` 文件字段。

GPT Image 的结果通常在 `data[0].b64_json`。用百炼 Qwen Image 模型时，可以沿用此兼容端点，默认从 `data[0].url` 取图。
