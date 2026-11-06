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
	assert.Contains(t, plugin.Meta.AllowedHosts, "dashscope.aliyuncs.com")
	assert.Contains(t, plugin.Meta.AllowedHosts, "dashscope-intl.aliyuncs.com")

	_, err = plugin.Engine.Call(t.Context(), "validateConfig", map[string]any{"sample_rate": 12345})
	require.ErrorContains(t, err, "sample_rate is not supported")
	_, err = plugin.Engine.Call(t.Context(), "validateConfig", map[string]any{"qwen_base_url": "https://example.com"})
	require.ErrorContains(t, err, "official Alibaba Cloud Model Studio HTTP base URL")

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

	qwenDecodedValue, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_audio_speech", "decodeRequest"}, map[string]any{
		"model": "qwen3-tts-flash",
		"body": map[string]any{"kind": "json", "value": map[string]any{
			"model": "qwen3-tts-flash", "input": "你好", "voice": "Cherry", "response_format": "wav",
		}},
	})
	require.NoError(t, err)
	qwenDecoded := qwenDecodedValue.(map[string]any)
	qwenBuiltValue, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_audio_speech", "buildRequest"}, map[string]any{
		"requestBody":   qwenDecoded["requestBody"],
		"model":         "qwen3-tts-flash",
		"upstreamModel": "qwen3-tts-flash",
		"baseUrl":       "https://workspace.cn-beijing.maas.aliyuncs.com",
		"authHeader":    "Bearer secret",
		"config":        plugin.Meta.ConfigDefaults,
	})
	require.NoError(t, err)
	qwenBuilt := qwenBuiltValue.(map[string]any)
	assert.Equal(t, "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", qwenBuilt["url"])
	require.NoError(t, jsplugin.ValidateRequestURL(qwenBuilt["url"].(string), "https://workspace.cn-beijing.maas.aliyuncs.com", plugin.Meta.AllowedHosts))
}

func TestAlibabaTTSNativeContracts(t *testing.T) {
	source, err := Source("alibaba-tts")
	require.NoError(t, err)
	plugin, err := jsplugin.CompilePlugin(source, jsplugin.Options{})
	require.NoError(t, err)
	assert.False(t, plugin.Meta.UsesTaskDriver())
	for _, tc := range []struct {
		name, model, decoder string
		input                map[string]any
		wantInput            map[string]any
	}{
		{"next references", "qwen-audio-3.1-tts-next", "speech", map[string]any{"text_prompt": "Two speakers discuss the weather", "references": []any{map[string]any{"audio_url": "https://example.com/reference.wav"}}, "channels": 2}, map[string]any{"channels": 2}},
		{"clone", "voice-enrollment", "customization", map[string]any{"action": "create_voice", "target_model": "qwen-audio-3.1-tts-plus", "prefix": "custom", "audio": "https://example.com/voice.wav"}, map[string]any{"prefix": "u7"}},
		{"design", "voice-enrollment", "customization", map[string]any{"action": "create_voice", "target_model": "cosyvoice-v3.5-plus", "prefix": "custom", "voice_prompt": "Warm female voice", "preview_text": "Welcome to our show, thank you for listening"}, map[string]any{"prefix": "u7"}},
		{"list isolation", "voice-enrollment", "customization", map[string]any{"action": "list_voice", "prefix": "another"}, map[string]any{"prefix": "u7"}},
		{"delete own voice", "voice-enrollment", "customization", map[string]any{"action": "delete_voice", "voice_id": "cosyvoice-v3.5-plus-u7-abc"}, map[string]any{"voice_id": "cosyvoice-v3.5-plus-u7-abc"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			decoded, err := plugin.Engine.CallPath(t.Context(), "native", []string{tc.decoder}, map[string]any{"userScope": "u7", "body": map[string]any{"kind": "json", "value": map[string]any{"model": tc.model, "input": tc.input}}})
			require.NoError(t, err)
			value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_audio_speech", "buildRequest"}, map[string]any{"requestBody": decoded.(map[string]any)["requestBody"], "model": tc.model, "upstreamModel": tc.model, "baseUrl": "https://dashscope.aliyuncs.com", "authHeader": "Bearer secret", "userScope": "u7", "config": plugin.Meta.ConfigDefaults})
			require.NoError(t, err)
			body := value.(map[string]any)["body"].(map[string]any)
			for key, expected := range tc.wantInput {
				assert.EqualValues(t, expected, body["input"].(map[string]any)[key])
			}
		})
	}
	for _, voice := range []string{"cosyvoice-v3.5-plus-u8-abc", "cosyvoice-v3.5-plus-external-abc"} {
		_, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_audio_speech", "buildRequest"}, map[string]any{"requestBody": map[string]any{"native": true, "family": "voice", "body": map[string]any{"input": map[string]any{"action": "delete_voice", "voice_id": voice}}}, "model": "voice-enrollment", "baseUrl": "https://dashscope.aliyuncs.com", "userScope": "u7", "config": plugin.Meta.ConfigDefaults})
		require.ErrorContains(t, err, "another gateway user")
	}
	for _, tc := range []struct {
		model string
		usage map[string]any
		facts map[string]any
	}{
		{"qwen-audio-3.1-tts-flash", map[string]any{"characters": 99, "input_tokens": 12, "output_tokens": 34}, map[string]any{"input_tokens": float64(12), "output_tokens": float64(34)}},
		{"qwen-audio-3.1-tts-next", map[string]any{"input_tokens": 177, "output_tokens": 320, "total_tokens": 497, "duration": 2}, map[string]any{"input_tokens": float64(177), "output_tokens": float64(320)}},
	} {
		value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_audio_speech", "parseResponse"}, map[string]any{"requestBody": map[string]any{"providerModel": tc.model}, "body": map[string]any{"output": map[string]any{"audio": map[string]any{"url": "https://example.com/audio.wav", "duration": 5.2}}, "usage": tc.usage}})
		require.NoError(t, err)
		facts, err := jsplugin.ValidateUsageFacts(plugin.Meta, value.(map[string]any)["usage"].(map[string]any)["facts"].(map[string]any), tc.model)
		require.NoError(t, err)
		assert.Equal(t, tc.facts, facts)
	}
	_, err = jsplugin.ValidateUsageFacts(plugin.Meta, map[string]any{"input_tokens": 12}, "qwen-audio-3.1-tts-flash")
	require.ErrorContains(t, err, "missing usage fact output_tokens")
	_, err = jsplugin.ValidateUsageFacts(plugin.Meta, map[string]any{"input_tokens": -1, "output_tokens": 320}, "qwen-audio-3.1-tts-next")
	require.Error(t, err)
	value, err := plugin.Engine.CallPath(t.Context(), "native", []string{"response"}, map[string]any{"userScope": "u7", "requestBody": map[string]any{"family": "voice", "body": map[string]any{"input": map[string]any{"action": "list_voice"}}}}, map[string]any{"output": map[string]any{"voice_list": []any{map[string]any{"voice_id": "cosyvoice-v3.5-plus-u7-own"}, map[string]any{"voice_id": "cosyvoice-v3.5-plus-u70-other"}}}})
	require.NoError(t, err)
	assert.Len(t, value.(map[string]any)["output"].(map[string]any)["voice_list"], 1)
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
