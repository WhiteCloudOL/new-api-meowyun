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

## Deploy with NewAPI

The NewAPI database only stores the channel configuration. Migrating the
database does **not** migrate this sidecar container. Deploy this service
separately whenever NewAPI is moved to another host.

Add the following service to the same Compose project as NewAPI:

```yaml
services:
  cosyvoice-openai:
    build:
      context: ./custom/cosyvoice-openai
      dockerfile: Dockerfile
    image: meowyun/cosyvoice-openai:1.1
    container_name: cosyvoice-openai
    restart: always
    environment:
      DASHSCOPE_BASE_URL: ${DASHSCOPE_BASE_URL:?set DASHSCOPE_BASE_URL}
      NEW_API_BILLING_MODE: characters
      COSYVOICE_SAMPLE_RATE: "24000"
      UPSTREAM_TIMEOUT_SECONDS: "120"
      TZ: Asia/Shanghai
    expose:
      - "8080"
    networks:
      - new-api-network
```

Do not add a host `ports` mapping. NewAPI reaches the service over the shared
Docker network at `http://cosyvoice-openai:8080`; the adapter must not be
published directly to the Internet.

Build and start only the sidecar without recreating NewAPI:

```bash
docker compose config --quiet
docker compose build --pull --no-cache cosyvoice-openai
docker compose up -d --no-deps cosyvoice-openai
```

Verify the container and the private-network path:

```bash
docker inspect --format '{{.State.Health.Status}}' cosyvoice-openai
docker exec new-api getent hosts cosyvoice-openai
docker exec new-api wget -qO- http://cosyvoice-openai:8080/healthz
```

After verification, remove build cache so a migration does not leave several
gigabytes of temporary layers:

```bash
docker builder prune -af
docker system df
```

## Migration checklist

- Migrate the NewAPI database and confirm the CosyVoice channel still points
  to `http://cosyvoice-openai:8080`.
- Confirm `custom/cosyvoice-openai` exists in the destination checkout.
- Copy the previous deployment's `DASHSCOPE_BASE_URL`; do not put the Alibaba
  API key in this service because the NewAPI channel forwards it per request.
- Add `cosyvoice-openai` to the destination Compose project and the same
  network as NewAPI.
- Keep port 8080 private; use `expose`, not `ports`.
- Run the unit tests, build without cache, and wait for a healthy container.
- Test DNS and `/healthz` from inside the NewAPI container.
- Send one short `/v1/audio/speech` request through NewAPI before retiring the
  old sidecar.
- Clean Docker build cache and confirm NewAPI remains healthy.
