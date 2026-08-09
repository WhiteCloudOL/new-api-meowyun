"""Expose Alibaba Cloud CosyVoice through the OpenAI speech endpoint."""

from __future__ import annotations

import base64
import json
import logging
import os
import shutil
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib import error, request

LOGGER = logging.getLogger("cosyvoice-openai")
SPEECH_PATH = "/v1/audio/speech"
DASHSCOPE_PATH = "/api/v1/services/audio/tts/SpeechSynthesizer"
NEW_API_USAGE_CHARACTERS_HEADER = "X-NewAPI-Usage-Characters"
NEW_API_BILLING_MODE_ENV = "NEW_API_BILLING_MODE"
MAX_REQUEST_BYTES = 1_048_576
SUPPORTED_FORMATS = {
    "mp3": "audio/mpeg",
    "opus": "audio/ogg",
    "pcm": "application/octet-stream",
    "wav": "audio/wav",
}


class ClientError(Exception):
    """An error that can be returned to an OpenAI-compatible client."""

    def __init__(
        self,
        status: HTTPStatus,
        message: str,
        code: str = "invalid_request_error",
    ) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


def build_dashscope_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Convert an OpenAI speech request into a DashScope TTS request."""
    model = _required_string(payload, "model")
    text = _required_string(payload, "input")
    voice = _required_string(payload, "voice")

    response_format = str(payload.get("response_format") or "mp3").lower()
    if response_format not in SUPPORTED_FORMATS:
        supported = ", ".join(sorted(SUPPORTED_FORMATS))
        raise ClientError(
            HTTPStatus.BAD_REQUEST,
            f"Unsupported response_format '{response_format}'. "
            f"Supported formats: {supported}.",
        )

    input_payload: dict[str, Any] = {
        "text": text,
        "voice": voice,
        "format": response_format,
        "sample_rate": _sample_rate(),
    }

    speed = payload.get("speed")
    if speed is not None:
        try:
            rate = float(speed)
        except (TypeError, ValueError) as exc:
            raise ClientError(
                HTTPStatus.BAD_REQUEST,
                "speed must be a number between 0.5 and 2.0.",
            ) from exc
        if not 0.5 <= rate <= 2.0:
            raise ClientError(
                HTTPStatus.BAD_REQUEST,
                "CosyVoice supports speed values between 0.5 and 2.0.",
            )
        input_payload["rate"] = rate

    instructions = payload.get("instructions")
    if isinstance(instructions, str) and instructions.strip():
        input_payload["instruction"] = instructions.strip()

    return {"model": model, "input": input_payload}


def _required_string(payload: dict[str, Any], field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ClientError(
            HTTPStatus.BAD_REQUEST,
            f"'{field}' is required and must be a non-empty string.",
        )
    return value.strip()


def _sample_rate() -> int:
    raw_value = os.getenv("COSYVOICE_SAMPLE_RATE", "24000")
    try:
        sample_rate = int(raw_value)
    except ValueError as exc:
        raise RuntimeError("COSYVOICE_SAMPLE_RATE must be an integer.") from exc
    if sample_rate not in {8000, 16000, 22050, 24000, 44100, 48000}:
        raise RuntimeError("COSYVOICE_SAMPLE_RATE is not supported by CosyVoice.")
    return sample_rate


def _upstream_endpoint() -> str:
    base_url = os.environ["DASHSCOPE_BASE_URL"].rstrip("/")
    return base_url + DASHSCOPE_PATH


def _timeout() -> float:
    return float(os.getenv("UPSTREAM_TIMEOUT_SECONDS", "120"))


def _upstream_error_message(body: bytes, fallback: str) -> str:
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return fallback

    for path in (
        ("message",),
        ("error", "message"),
        ("output", "message"),
    ):
        value: Any = payload
        for key in path:
            if not isinstance(value, dict):
                value = None
                break
            value = value.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return fallback


def _usage_characters(payload: dict[str, Any]) -> int | None:
    billing_mode = os.getenv(NEW_API_BILLING_MODE_ENV, "characters").lower()
    if billing_mode == "openai_audio":
        return None
    if billing_mode != "characters":
        raise RuntimeError(
            f"{NEW_API_BILLING_MODE_ENV} must be 'characters' or 'openai_audio'."
        )

    usage = payload.get("usage")
    if not isinstance(usage, dict):
        return None
    characters = usage.get("characters")
    if isinstance(characters, bool) or not isinstance(characters, int):
        return None
    return characters if characters >= 0 else None


class SpeechHandler(BaseHTTPRequestHandler):
    """Handle OpenAI-compatible speech synthesis requests."""

    server_version = "cosyvoice-openai"
    sys_version = ""

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/healthz":
            self._write_error(
                HTTPStatus.NOT_FOUND,
                "Endpoint not found.",
                "not_found",
            )
            return
        self._write_json(HTTPStatus.OK, {"status": "ok"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0].rstrip("/") != SPEECH_PATH:
            self._write_error(
                HTTPStatus.NOT_FOUND,
                "Only POST /v1/audio/speech is supported.",
                "not_found",
            )
            return

        try:
            authorization = self.headers.get("Authorization", "").strip()
            if not authorization.lower().startswith("bearer "):
                raise ClientError(
                    HTTPStatus.UNAUTHORIZED,
                    "A Bearer API key is required.",
                    "invalid_api_key",
                )
            payload = self._read_json_body()
            dashscope_payload = build_dashscope_payload(payload)
            self._synthesize(authorization, dashscope_payload)
        except ClientError as exc:
            self._write_error(exc.status, exc.message, exc.code)
        except (error.URLError, TimeoutError) as exc:
            LOGGER.warning("DashScope request failed: %s", exc)
            self._write_error(
                HTTPStatus.BAD_GATEWAY,
                "Unable to reach the CosyVoice upstream service.",
                "upstream_connection_error",
            )
        except (KeyError, RuntimeError, ValueError) as exc:
            LOGGER.error("Service configuration error: %s", exc)
            self._write_error(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                "The CosyVoice compatibility service is misconfigured.",
                "server_error",
            )

    def _read_json_body(self) -> dict[str, Any]:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ClientError(
                HTTPStatus.BAD_REQUEST,
                "Invalid Content-Length header.",
            ) from exc
        if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
            raise ClientError(
                HTTPStatus.BAD_REQUEST,
                "Request body is empty or too large.",
            )
        try:
            payload = json.loads(self.rfile.read(content_length))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ClientError(
                HTTPStatus.BAD_REQUEST,
                "Request body must be valid JSON.",
            ) from exc
        if not isinstance(payload, dict):
            raise ClientError(
                HTTPStatus.BAD_REQUEST,
                "Request body must be a JSON object.",
            )
        return payload

    def _synthesize(
        self,
        authorization: str,
        dashscope_payload: dict[str, Any],
    ) -> None:
        upstream_request = request.Request(
            _upstream_endpoint(),
            data=json.dumps(
                dashscope_payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8"),
            headers={
                "Authorization": authorization,
                "Content-Type": "application/json",
                "User-Agent": "cosyvoice-openai/1.0",
            },
            method="POST",
        )

        try:
            with request.urlopen(upstream_request, timeout=_timeout()) as response:
                response_body = response.read()
        except error.HTTPError as exc:
            body = exc.read()
            message = _upstream_error_message(
                body,
                f"CosyVoice upstream returned HTTP {exc.code}.",
            )
            raise ClientError(
                HTTPStatus.BAD_GATEWAY,
                message,
                "upstream_error",
            ) from exc

        try:
            response_payload = json.loads(response_body)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ClientError(
                HTTPStatus.BAD_GATEWAY,
                "CosyVoice returned an invalid JSON response.",
                "upstream_response_error",
            ) from exc

        output = response_payload.get("output") or {}
        audio = output.get("audio") or {}
        request_id = response_payload.get("request_id")
        response_format = dashscope_payload["input"]["format"]
        usage_characters = _usage_characters(response_payload)

        audio_data = audio.get("data")
        if isinstance(audio_data, str) and audio_data:
            try:
                decoded_audio = base64.b64decode(audio_data, validate=True)
            except ValueError as exc:
                raise ClientError(
                    HTTPStatus.BAD_GATEWAY,
                    "CosyVoice returned invalid Base64 audio data.",
                    "upstream_response_error",
                ) from exc
            self._write_audio_bytes(
                decoded_audio,
                response_format,
                request_id,
                usage_characters,
            )
            return

        audio_url = audio.get("url")
        if not isinstance(audio_url, str) or not audio_url:
            raise ClientError(
                HTTPStatus.BAD_GATEWAY,
                _upstream_error_message(
                    response_body,
                    "CosyVoice did not return audio data or an audio URL.",
                ),
                "upstream_response_error",
            )
        self._proxy_audio_url(
            audio_url,
            response_format,
            request_id,
            usage_characters,
        )

    def _proxy_audio_url(
        self,
        audio_url: str,
        response_format: str,
        request_id: Any,
        usage_characters: int | None,
    ) -> None:
        audio_request = request.Request(
            audio_url,
            headers={"User-Agent": "cosyvoice-openai/1.0"},
        )
        try:
            audio_response = request.urlopen(audio_request, timeout=_timeout())
        except error.HTTPError as exc:
            raise ClientError(
                HTTPStatus.BAD_GATEWAY,
                f"Unable to download generated audio (HTTP {exc.code}).",
                "audio_download_error",
            ) from exc

        with audio_response:
            content_type = audio_response.headers.get(
                "Content-Type",
                SUPPORTED_FORMATS[response_format],
            )
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            content_length = audio_response.headers.get("Content-Length")
            if content_length:
                self.send_header("Content-Length", content_length)
            if request_id:
                self.send_header("X-Request-Id", str(request_id))
            if usage_characters is not None:
                self.send_header(
                    NEW_API_USAGE_CHARACTERS_HEADER,
                    str(usage_characters),
                )
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            shutil.copyfileobj(audio_response, self.wfile, length=64 * 1024)

    def _write_audio_bytes(
        self,
        audio: bytes,
        response_format: str,
        request_id: Any,
        usage_characters: int | None,
    ) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", SUPPORTED_FORMATS[response_format])
        self.send_header("Content-Length", str(len(audio)))
        if request_id:
            self.send_header("X-Request-Id", str(request_id))
        if usage_characters is not None:
            self.send_header(
                NEW_API_USAGE_CHARACTERS_HEADER,
                str(usage_characters),
            )
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(audio)

    def _write_error(
        self,
        status: HTTPStatus,
        message: str,
        code: str,
    ) -> None:
        self._write_json(
            status,
            {
                "error": {
                    "message": message,
                    "type": "invalid_request_error"
                    if status < HTTPStatus.INTERNAL_SERVER_ERROR
                    else "server_error",
                    "param": None,
                    "code": code,
                }
            },
        )

    def _write_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, message_format: str, *args: Any) -> None:
        LOGGER.info("%s - %s", self.address_string(), message_format % args)


def main() -> None:
    """Start the compatibility HTTP server."""
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    host = os.getenv("LISTEN_HOST", "0.0.0.0")
    port = int(os.getenv("LISTEN_PORT", "8080"))
    server = ThreadingHTTPServer((host, port), SpeechHandler)
    LOGGER.info("Listening on %s:%d", host, port)
    server.serve_forever()


if __name__ == "__main__":
    main()
