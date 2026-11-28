## List models

`GET /v1/models` returns the model IDs available to your API key. Use the exact `data[].id` as the `model` in subsequent requests.

```bash
curl '{{API_BASE}}/v1/models' \
  -H "Authorization: Bearer $NEW_API_KEY"

curl '{{API_BASE}}/v1/models/MODEL_ID' \
  -H "Authorization: Bearer $NEW_API_KEY"
```

The API key's model restrictions and group affect the list. To check modalities and protocols, open the model's **API** tab in the [Model Square](/pricing).

## Embeddings

Send a string or an array of strings as `input` to `POST /v1/embeddings`. Read `data[].embedding` in input order.

```bash
curl '{{API_BASE}}/v1/embeddings' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"EMBEDDING_MODEL_ID","input":["First document","Second document"]}'
```

## Reranking

Send `query` and candidate `documents` to `POST /v1/rerank`. This route uses the supported provider's rerank response structure, usually containing original document indices and relevance scores.

```bash
curl '{{API_BASE}}/v1/rerank' \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"RERANK_MODEL_ID","query":"Release notes","documents":["Server updates","Lunch menu"],"top_n":1}'
```

## Moderation

For a model that supports moderation, send `model` and `input` to `POST /v1/moderations`. Read the classification flags and scores in `results`.
