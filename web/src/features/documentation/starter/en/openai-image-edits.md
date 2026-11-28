## Edit a local image

Send `multipart/form-data` to **`POST /v1/images/edits`**. The OpenAI SDK method is `client.images.edit(...)`.

```bash
curl '{{API_BASE}}/v1/images/edits' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -F 'model=gpt-image-2' \
  -F 'image[]=@reference.png' \
  -F 'prompt=Keep the subject and switch the background to a beach at sunset'
```

For one image, send `image` or `image[]`. Repeat `image[]` for models that accept multiple references. Let curl set the multipart boundary when using `-F`. Check model support for the optional `mask` file before restricting the editable area.

GPT Image generally returns `data[0].b64_json`. Qwen Image models using this compatibility endpoint typically return `data[0].url`.
