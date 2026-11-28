## 列出和查询模型

`GET /v1/models` 返回当前 API 密钥可用的模型列表。后续请求的 `model` 填列表里的 `data[].id`。

```bash
curl '{{API_BASE}}/v1/models' \
  -H "Authorization: Bearer $NEW_API_KEY"

curl '{{API_BASE}}/v1/models/MODEL_ID' \
  -H "Authorization: Bearer $NEW_API_KEY"
```

列表受密钥的可用分组和模型限制影响。模型支持的模态和协议可在[模型广场](/pricing)的 **API** 页签查看。

## 文本向量 Embeddings

向 `POST /v1/embeddings` 提交 `model` 和 `input`。`input` 可以是一段文本或文本数组，返回结果中的 `data[].embedding` 对应输入顺序。

```bash
curl '{{API_BASE}}/v1/embeddings' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"EMBEDDING_MODEL_ID","input":["第一篇文档","第二篇文档"]}'
```

## 相关性排序 Rerank

向 `POST /v1/rerank` 提交 `query` 和候选 `documents`。响应沿用所选重排序模型的结构，通常包含原文档索引和相关度得分。

```bash
curl '{{API_BASE}}/v1/rerank' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"RERANK_MODEL_ID","query":"版本更新","documents":["服务器更新","午餐菜单"],"top_n":1}'
```

## 内容审核

选用支持审核的模型，向 `POST /v1/moderations` 提交 `model` 和 `input`。分类标记和分数在 `results` 中。
