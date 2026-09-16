package plugins

import (
	"testing"

	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAlibabaTTSPluginContracts(t *testing.T) {
	source, err := Source("alibaba-tts")
	require.NoError(t, err)
	plugin, err := jsplugin.CompilePlugin(source, jsplugin.Options{Key: "alibaba-tts"})
	require.NoError(t, err)
	assert.Equal(t, "阿里云 TTS 兼容", plugin.Meta.Name)
	assert.Contains(t, plugin.Meta.Models, "cosyvoice-v3.5-plus")
	assert.Contains(t, plugin.Meta.Models, "qwen3-tts-instruct-flash")

	_, err = plugin.Engine.Call(t.Context(), "validateConfig", map[string]any{"sample_rate": 12345})
	require.ErrorContains(t, err, "sample_rate is not supported")

	decodedValue, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_audio_speech", "decodeRequest"}, map[string]any{
		"model": "cosyvoice-v3.5-plus",
		"body": map[string]any{"kind": "json", "value": map[string]any{
			"model": "cosyvoice-v3.5-plus", "input": "你好", "voice": "longxiaochun", "response_format": "mp3", "speed": 1.25,
		}},
	})
	require.NoError(t, err)
	decoded := decodedValue.(map[string]any)
	assert.Equal(t, "relay", decoded["kind"])

	builtValue, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_audio_speech", "buildRequest"}, map[string]any{
		"requestBody":   decoded["requestBody"],
		"model":         "cosyvoice-v3.5-plus",
		"upstreamModel": "cosyvoice-v3.5-plus",
		"baseUrl":       "https://dashscope.aliyuncs.com/api/v1",
		"authHeader":    "Bearer secret",
		"config":        plugin.Meta.ConfigDefaults,
	})
	require.NoError(t, err)
	built := builtValue.(map[string]any)
	assert.Equal(t, "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer", built["url"])
	requestBody := built["body"].(map[string]any)
	input := requestBody["input"].(map[string]any)
	assert.Equal(t, 1.25, input["rate"])
	assert.Equal(t, int64(24000), input["sample_rate"])

	parsedValue, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_audio_speech", "parseResponse"}, map[string]any{
		"statusCode": 200,
		"body": map[string]any{
			"request_id": "req-1",
			"output":     map[string]any{"audio": map[string]any{"data": "YXVkaW8=", "url": ""}},
			"usage":      map[string]any{"characters": int64(2)},
		},
		"config": plugin.Meta.ConfigDefaults,
	})
	require.NoError(t, err)
	parsed := parsedValue.(map[string]any)
	usage := parsed["usage"].(map[string]any)
	assert.Equal(t, int64(2), usage["characters"])
	assert.Equal(t, "req-1", parsed["requestId"])
}

func TestAlibabaTTSPluginRejectsUnsupportedRequestShapes(t *testing.T) {
	source, err := Source("alibaba-tts")
	require.NoError(t, err)
	plugin, err := jsplugin.CompilePlugin(source, jsplugin.Options{Key: "alibaba-tts"})
	require.NoError(t, err)

	_, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_audio_speech", "decodeRequest"}, map[string]any{
		"model": "qwen3-tts-flash",
		"body": map[string]any{"kind": "json", "value": map[string]any{
			"model": "qwen3-tts-flash", "input": "hello", "voice": "Cherry", "response_format": "mp3",
		}},
	})
	require.ErrorContains(t, err, "Qwen TTS HTTP output is wav")

	_, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_audio_speech", "decodeRequest"}, map[string]any{
		"model": "cosyvoice-v3.5-plus",
		"body": map[string]any{"kind": "json", "value": map[string]any{
			"model": "cosyvoice-v3.5-plus", "input": "hello", "voice": "longxiaochun",
			"metadata": map[string]any{"alibaba_tts": map[string]any{"unknown": true}},
		}},
	})
	require.ErrorContains(t, err, "unknown metadata.alibaba_tts field")
}
