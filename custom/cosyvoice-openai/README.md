# CosyVoice OpenAI compatibility service

This small standard-library Python service converts OpenAI-compatible speech requests into Alibaba Cloud Model Studio CosyVoice HTTP requests. It is intended to run on the same private Docker network as NewAPI.

## Request flow

1. A client calls NewAPI at `POST /v1/audio/speech`.
2. NewAPI forwards the request and channel Bearer key to this service.
3. This service sends the converted request to Alibaba Cloud Model Studio.
4. Audio is returned to NewAPI as an OpenAI-compatible binary response.
5. In character mode, the upstream `usage.characters` value is returned to NewAPI in an internal response header for settlement.

Do not publish this service directly to the Internet. NewAPI should be the only client.

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DASHSCOPE_BASE_URL` | Yes | None | Alibaba Cloud Model Studio API origin without the TTS path. |
| `NEW_API_BILLING_MODE` | No | `characters` | `characters` uses upstream character usage; `openai_audio` restores NewAPI's standard duration billing. |
| `COSYVOICE_SAMPLE_RATE` | No | `24000` | Output sample rate. |
| `UPSTREAM_TIMEOUT_SECONDS` | No | `120` | Upstream and audio-download timeout. |
| `LISTEN_HOST` | No | `0.0.0.0` | Bind address. |
| `LISTEN_PORT` | No | `8080` | Bind port. |
| `LOG_LEVEL` | No | `INFO` | Python log level. |

The Alibaba API key is not stored in this service. It receives NewAPI's channel `Authorization: Bearer ...` header and forwards it upstream.

## NewAPI channel

Create an OpenAI-compatible channel with:

- Base URL: `http://cosyvoice-openai:8080`
- Key: the Alibaba Cloud Model Studio API key
- Model: the required CosyVoice model, such as `cosyvoice-v3-flash`
- Endpoint: `/v1/audio/speech`

Use the same Docker network for both containers. `docker-compose.example.yml` is a sanitized sidecar example and expects an existing NewAPI network.

## Test and build

```bash
python -m unittest -v test_app.py
python -m py_compile app.py test_app.py
docker build -t meowyun/cosyvoice-openai:local .
```
