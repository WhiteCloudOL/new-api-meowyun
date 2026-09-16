package controller

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateTaskPluginChannel(t *testing.T) {
	source := `
export const meta = {apiVersion: 1, key: "channel-validation", name: "Validation", version: "1.0.0", author: {name: "Test"}, models: ["doc"], fetchMode: "per_task"};
export function buildSubmitRequest() { return {}; }
export function parseSubmitResponse() { return {}; }
export function buildQueryRequest() { return {}; }
export function parseTaskResult() { return {}; }
`
	_, err := jsplugin.DefaultRegistry.Register(source, jsplugin.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { jsplugin.DefaultRegistry.Unregister("channel-validation") })
	baseURL := "https://example.com"

	channel := &model.Channel{Type: constant.ChannelTypeTaskPlugin, BaseURL: &baseURL}
	require.ErrorContains(t, validateChannel(channel, false), "task plugin key is required")

	missing := `{"task_plugin_key":"missing"}`
	channel.Setting = &missing
	require.ErrorContains(t, validateChannel(channel, false), "is not registered")

	longKey := `{"task_plugin_key":"` + strings.Repeat("x", 31) + `"}`
	channel.Setting = &longKey
	require.ErrorContains(t, validateChannel(channel, false), "must not exceed 30")

	valid := `{"task_plugin_key":"channel-validation"}`
	channel.Setting = &valid
	channel.BaseURL = nil
	require.ErrorContains(t, validateChannel(channel, false), "base URL is required")
}

func TestValidateTaskPluginChannelFillsPluginDefaultBaseURL(t *testing.T) {
	source := `
export const meta = {apiVersion: 1, key: "channel-default-url", name: "Default URL", version: "1.0.0", author: {name: "Test"}, baseUrl: "http://127.0.0.1:8000/", models: ["doc"], fetchMode: "per_task"};
export function buildSubmitRequest() { return {}; }
export function parseSubmitResponse() { return {}; }
export function buildQueryRequest() { return {}; }
export function parseTaskResult() { return {}; }
`
	_, err := jsplugin.DefaultRegistry.Register(source, jsplugin.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { jsplugin.DefaultRegistry.Unregister("channel-default-url") })
	bound := `{"task_plugin_key":"channel-default-url"}`

	empty := "  "
	for _, baseURL := range []*string{nil, &empty} {
		channel := &model.Channel{Type: constant.ChannelTypeTaskPlugin, Key: "sk", Setting: &bound, BaseURL: baseURL}
		require.NoError(t, validateChannel(channel, true))
		require.NotNil(t, channel.BaseURL)
		assert.Equal(t, "http://127.0.0.1:8000", *channel.BaseURL, "normalized plugin default is persisted onto the channel")
	}

	explicit := "https://override.example.com"
	channel := &model.Channel{Type: constant.ChannelTypeTaskPlugin, Setting: &bound, BaseURL: &explicit}
	require.NoError(t, validateChannel(channel, false))
	assert.Equal(t, explicit, *channel.BaseURL, "an administrator value is never replaced by the plugin default")
}

func TestValidateTaskPluginChannelConfiguration(t *testing.T) {
	source := `
export const meta = {apiVersion: 1, key: "channel-config", name: "Config", version: "1.0.0", author: {name: "Test"}, baseUrl: "https://example.com", models: ["speech"], fetchMode: "per_task", protocols: [{name: "openai_audio_speech"}], configDefaults: {volume: 50}};
export function validateConfig(config) { if (!config || config.volume < 0 || config.volume > 100) throw new Error("volume out of range"); return true; }
export const protocols = {openai_audio_speech: {decodeRequest(ctx) { return {kind: "relay", model: ctx.model}; }, buildRequest() { return {}; }, parseResponse() { return {}; }}};
`
	_, err := jsplugin.DefaultRegistry.Register(source, jsplugin.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, jsplugin.DefaultRegistry.Unregister("channel-config")) })

	valid := `{"task_plugin_key":"channel-config","task_plugin_config":{"volume":80}}`
	channel := &model.Channel{Type: constant.ChannelTypeTaskPlugin, Key: "sk", Setting: &valid}
	require.NoError(t, validateChannel(channel, true))

	invalid := `{"task_plugin_key":"channel-config","task_plugin_config":{"volume":101}}`
	channel.Setting = &invalid
	require.ErrorContains(t, validateChannel(channel, true), "volume out of range")
}
