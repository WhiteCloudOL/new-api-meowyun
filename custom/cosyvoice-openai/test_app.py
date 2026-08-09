"""Unit tests for the CosyVoice request conversion."""

from __future__ import annotations

import os
import unittest
from unittest import mock

from app import ClientError, _usage_characters, build_dashscope_payload


class BuildDashScopePayloadTests(unittest.TestCase):
    """Verify OpenAI request fields are mapped to DashScope fields."""

    @mock.patch.dict(os.environ, {"COSYVOICE_SAMPLE_RATE": "24000"})
    def test_maps_supported_fields(self) -> None:
        payload = build_dashscope_payload(
            {
                "model": "cosyvoice-v3-flash",
                "input": "你好。",
                "voice": "longyan_v3",
                "response_format": "wav",
                "speed": 1.2,
                "instructions": "请温柔地说。",
            }
        )

        self.assertEqual(payload["model"], "cosyvoice-v3-flash")
        self.assertEqual(
            payload["input"],
            {
                "text": "你好。",
                "voice": "longyan_v3",
                "format": "wav",
                "sample_rate": 24000,
                "rate": 1.2,
                "instruction": "请温柔地说。",
            },
        )

    def test_defaults_to_mp3(self) -> None:
        payload = build_dashscope_payload(
            {
                "model": "cosyvoice-v3-flash",
                "input": "你好。",
                "voice": "longyan_v3",
            }
        )

        self.assertEqual(payload["input"]["format"], "mp3")

    def test_rejects_unsupported_format(self) -> None:
        with self.assertRaises(ClientError):
            build_dashscope_payload(
                {
                    "model": "cosyvoice-v3-flash",
                    "input": "你好。",
                    "voice": "longyan_v3",
                    "response_format": "flac",
                }
            )

    def test_rejects_out_of_range_speed(self) -> None:
        with self.assertRaises(ClientError):
            build_dashscope_payload(
                {
                    "model": "cosyvoice-v3-flash",
                    "input": "你好。",
                    "voice": "longyan_v3",
                    "speed": 3,
                }
            )


class UsageCharactersTests(unittest.TestCase):
    """Verify DashScope character usage is extracted without estimation."""

    def test_extracts_character_count(self) -> None:
        self.assertEqual(_usage_characters({"usage": {"characters": 29}}), 29)

    def test_rejects_invalid_character_count(self) -> None:
        self.assertIsNone(_usage_characters({"usage": {"characters": "29"}}))
        self.assertIsNone(_usage_characters({"usage": {"characters": -1}}))

    @mock.patch.dict(
        os.environ,
        {"NEW_API_BILLING_MODE": "openai_audio"},
    )
    def test_can_restore_openai_audio_billing(self) -> None:
        self.assertIsNone(_usage_characters({"usage": {"characters": 29}}))

    @mock.patch.dict(os.environ, {"NEW_API_BILLING_MODE": "invalid"})
    def test_rejects_invalid_billing_mode(self) -> None:
        with self.assertRaises(RuntimeError):
            _usage_characters({"usage": {"characters": 29}})


if __name__ == "__main__":
    unittest.main()
