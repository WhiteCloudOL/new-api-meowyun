package jsplugin

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const (
	maxPluginAudioResponseBytes = 2 << 20
	defaultPluginAudioBytes     = 32 << 20
	maxPluginAudioBytes         = 64 << 20
)

type audioRequestDescriptor struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
	Body    any               `json:"body"`
}

type audioResponseDescriptor struct {
	Audio struct {
		Data string `json:"data"`
		URL  string `json:"url"`
	} `json:"audio"`
	Format              string   `json:"format"`
	RequestID           string   `json:"requestId"`
	AllowedHostSuffixes []string `json:"allowedHostSuffixes"`
	MaxBytes            int      `json:"maxBytes"`
	TimeoutSeconds      int      `json:"timeoutSeconds"`
	Usage               struct {
		Characters        float64 `json:"characters"`
		InputTextTokens   float64 `json:"inputTextTokens"`
		OutputAudioTokens float64 `json:"outputAudioTokens"`
		TotalTokens       float64 `json:"totalTokens"`
	} `json:"usage"`
}

// AudioAdaptor lets a synchronous task plugin implement OpenAI speech without
// granting JavaScript network access. The host owns transport, downloads,
// response limits, usage normalization, and billing handoff.
type AudioAdaptor struct {
	openai.Adaptor
	plugin  *pluginruntime.LoadedPlugin
	request *audioRequestDescriptor
	format  string
}

func NewAudio(plugin *pluginruntime.LoadedPlugin) *AudioAdaptor {
	return &AudioAdaptor{plugin: plugin}
}

func (a *AudioAdaptor) Init(*relaycommon.RelayInfo) {}

func (a *AudioAdaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {
	if a.request == nil {
		return "", fmt.Errorf("plugin audio request was not built")
	}
	if err := pluginruntime.ValidateRequestURL(a.request.URL, info.ChannelBaseUrl, a.plugin.Meta.AllowedHosts); err != nil {
		return "", err
	}
	if method := strings.ToUpper(strings.TrimSpace(a.request.Method)); method != "" && method != http.MethodPost {
		return "", fmt.Errorf("plugin audio request method must be POST")
	}
	return a.request.URL, nil
}

func (a *AudioAdaptor) SetupRequestHeader(c *gin.Context, headers *http.Header, info *relaycommon.RelayInfo) error {
	channel.SetupApiRequestHeader(info, c, headers)
	for name, value := range a.request.Headers {
		if strings.EqualFold(name, "Host") || strings.EqualFold(name, "Content-Length") {
			return fmt.Errorf("plugin audio request cannot set header %q", name)
		}
		headers.Set(name, value)
	}
	return nil
}

func (a *AudioAdaptor) ConvertAudioRequest(c *gin.Context, info *relaycommon.RelayInfo, _ dto.AudioRequest) (io.Reader, error) {
	pinnedValue, exists := c.Get(pluginruntime.ContextKeyPinnedEndpoint)
	pinned, ok := pinnedValue.(pluginruntime.PinnedEndpoint)
	if !exists || !ok || pinned.Plugin != a.plugin || pinned.Protocol != "openai_audio_speech" {
		return nil, fmt.Errorf("plugin audio endpoint is not pinned")
	}
	protocolValue, exists := c.Get(pluginruntime.ContextKeyProtocolRequest)
	protocolContext, ok := protocolValue.(pluginruntime.ProtocolRequestContext)
	if !exists || !ok {
		return nil, fmt.Errorf("plugin audio request context is missing")
	}
	decodedValue, err := a.plugin.Engine.CallPath(
		context.WithoutCancel(c.Request.Context()),
		"protocols",
		[]string{pinned.Protocol, "decodeRequest"},
		protocolContext.JSValue(),
	)
	if err != nil {
		return nil, err
	}
	decoded, ok := decodedValue.(map[string]any)
	if !ok || decoded["kind"] != "relay" || decoded["model"] != pinned.Model {
		return nil, fmt.Errorf("plugin audio decoder returned an invalid relay intent")
	}
	requestBody := decoded["requestBody"]
	if normalized, valid := requestBody.(map[string]any); valid {
		a.format, _ = normalized["format"].(string)
	}
	config := pluginruntime.EffectiveConfig(a.plugin.Meta.ConfigDefaults, info.ChannelSetting.TaskPluginConfig)
	ctx := map[string]any{
		"requestBody":   requestBody,
		"model":         pinned.Model,
		"upstreamModel": info.UpstreamModelName,
		"baseUrl":       info.ChannelBaseUrl,
		"apiKey":        info.ApiKey,
		"authHeader":    "Bearer " + info.ApiKey,
		"config":        config,
	}
	value, err := a.plugin.Engine.CallPath(c.Request.Context(), "protocols", []string{pinned.Protocol, "buildRequest"}, ctx)
	if err != nil {
		return nil, err
	}
	var descriptor audioRequestDescriptor
	if err = convert(value, &descriptor); err != nil {
		return nil, err
	}
	a.request = &descriptor
	if _, err = a.GetRequestURL(info); err != nil {
		return nil, err
	}
	body, err := common.Marshal(descriptor.Body)
	if err != nil {
		return nil, err
	}
	return bytes.NewReader(body), nil
}

func (a *AudioAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, body io.Reader) (any, error) {
	originalMethod := c.Request.Method
	c.Request.Method = http.MethodPost
	defer func() { c.Request.Method = originalMethod }()
	return channel.DoApiRequest(a, c, info, body)
}

func (a *AudioAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (any, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxPluginAudioResponseBytes+1))
	if err != nil || len(body) > maxPluginAudioResponseBytes {
		if err == nil {
			err = fmt.Errorf("plugin audio response exceeds size limit")
		}
		return nil, pluginAudioResponseError(err)
	}
	var responseBody any = string(body)
	var decoded any
	if common.Unmarshal(body, &decoded) == nil {
		responseBody = decoded
	}
	headers := make(map[string][]string, len(resp.Header))
	for name, values := range resp.Header {
		headers[name] = append([]string(nil), values...)
	}
	config := pluginruntime.EffectiveConfig(a.plugin.Meta.ConfigDefaults, info.ChannelSetting.TaskPluginConfig)
	value, err := a.plugin.Engine.CallPath(c.Request.Context(), "protocols", []string{"openai_audio_speech", "parseResponse"}, map[string]any{
		"statusCode": resp.StatusCode,
		"headers":    headers,
		"body":       responseBody,
		"config":     config,
	})
	if err != nil {
		return nil, pluginAudioResponseError(err)
	}
	var parsed audioResponseDescriptor
	if err = convert(value, &parsed); err != nil {
		return nil, pluginAudioResponseError(err)
	}
	audio, err := a.readAudio(c, parsed)
	if err != nil {
		return nil, pluginAudioResponseError(err)
	}
	usage, err := normalizePluginAudioUsage(c, info, parsed)
	if err != nil {
		return nil, pluginAudioResponseError(err)
	}
	format := strings.ToLower(strings.TrimSpace(parsed.Format))
	if format == "" {
		format = strings.ToLower(strings.TrimSpace(a.format))
	}
	contentType, ok := map[string]string{
		"mp3": "audio/mpeg", "wav": "audio/wav", "pcm": "audio/pcm", "opus": "audio/opus",
	}[format]
	if !ok {
		return nil, pluginAudioResponseError(fmt.Errorf("plugin returned unsupported audio format %q", format))
	}
	c.Header("Content-Type", contentType)
	c.Header("Cache-Control", "no-store")
	if requestID := strings.TrimSpace(parsed.RequestID); requestID != "" && len(requestID) <= 256 && !strings.ContainsAny(requestID, "\r\n") {
		c.Header("X-Request-Id", requestID)
	}
	c.Data(http.StatusOK, contentType, audio)
	return usage, nil
}

func (a *AudioAdaptor) readAudio(c *gin.Context, parsed audioResponseDescriptor) ([]byte, error) {
	limit := parsed.MaxBytes
	if limit <= 0 {
		limit = defaultPluginAudioBytes
	}
	if limit > maxPluginAudioBytes {
		return nil, fmt.Errorf("plugin audio byte limit exceeds host maximum")
	}
	if parsed.Audio.Data != "" && parsed.Audio.URL != "" || parsed.Audio.Data == "" && parsed.Audio.URL == "" {
		return nil, fmt.Errorf("plugin must return exactly one audio source")
	}
	if parsed.Audio.Data != "" {
		decoded, err := base64.StdEncoding.DecodeString(parsed.Audio.Data)
		if err != nil {
			return nil, fmt.Errorf("plugin returned invalid base64 audio: %w", err)
		}
		if len(decoded) > limit {
			return nil, fmt.Errorf("plugin audio exceeds byte limit")
		}
		return decoded, nil
	}
	parsedURL, err := url.Parse(parsed.Audio.URL)
	if err != nil || parsedURL.Scheme != "https" && parsedURL.Scheme != "http" || parsedURL.Hostname() == "" || parsedURL.User != nil {
		return nil, fmt.Errorf("plugin returned an invalid audio URL")
	}
	host := strings.ToLower(strings.TrimSuffix(parsedURL.Hostname(), "."))
	allowed := false
	for _, suffix := range parsed.AllowedHostSuffixes {
		suffix = strings.ToLower(strings.TrimSpace(suffix))
		if suffix == "" || suffix[0] != '.' || strings.ContainsAny(suffix, "/:@?#") {
			continue
		}
		if strings.HasSuffix(host, suffix) && len(host) > len(suffix) {
			allowed = true
			break
		}
	}
	if !allowed {
		return nil, fmt.Errorf("plugin audio URL host is not allowed")
	}
	timeout := parsed.TimeoutSeconds
	if timeout <= 0 {
		timeout = 120
	}
	if timeout > 300 {
		return nil, fmt.Errorf("plugin audio timeout exceeds host maximum")
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, parsed.Audio.URL, nil)
	if err != nil {
		return nil, err
	}
	client := service.NewStrictSSRFProtectedHTTPClient(time.Duration(timeout) * time.Second)
	defer client.CloseIdleConnections()
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	download, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download plugin audio: %w", err)
	}
	defer service.CloseResponseBodyGracefully(download)
	if download.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download plugin audio returned status %d", download.StatusCode)
	}
	if download.ContentLength > int64(limit) {
		return nil, fmt.Errorf("plugin audio exceeds byte limit")
	}
	audio, err := io.ReadAll(io.LimitReader(download.Body, int64(limit)+1))
	if err != nil {
		return nil, err
	}
	if len(audio) > limit {
		return nil, fmt.Errorf("plugin audio exceeds byte limit")
	}
	return audio, nil
}

func normalizePluginAudioUsage(c *gin.Context, info *relaycommon.RelayInfo, parsed audioResponseDescriptor) (*dto.Usage, error) {
	characters, err := pluginUsageCount(parsed.Usage.Characters, "characters", info)
	if err != nil {
		return nil, err
	}
	inputTokens, err := pluginUsageCount(parsed.Usage.InputTextTokens, "inputTextTokens", info)
	if err != nil {
		return nil, err
	}
	outputTokens, err := pluginUsageCount(parsed.Usage.OutputAudioTokens, "outputAudioTokens", info)
	if err != nil {
		return nil, err
	}
	totalTokens, err := pluginUsageCount(parsed.Usage.TotalTokens, "totalTokens", info)
	if err != nil {
		return nil, err
	}
	usage := &dto.Usage{}
	if characters > 0 {
		if inputTokens > 0 || outputTokens > 0 || totalTokens > 0 {
			return nil, fmt.Errorf("plugin returned both character and token usage")
		}
		c.Set("billing_unit", "characters")
		c.Set("billing_characters", characters)
		usage.PromptTokens = characters
		usage.PromptTokensDetails.TextTokens = characters
		usage.TotalTokens = characters
		return usage, nil
	}
	if inputTokens <= 0 && outputTokens <= 0 {
		return nil, fmt.Errorf("plugin returned no billable usage")
	}
	if totalTokens == 0 {
		totalTokens = inputTokens + outputTokens
	}
	if totalTokens != inputTokens+outputTokens {
		return nil, fmt.Errorf("plugin returned inconsistent token usage")
	}
	usage.PromptTokens = inputTokens
	usage.PromptTokensDetails.TextTokens = inputTokens
	usage.CompletionTokens = outputTokens
	usage.CompletionTokenDetails.AudioTokens = outputTokens
	usage.TotalTokens = totalTokens
	return usage, nil
}

func pluginUsageCount(value float64, field string, info *relaycommon.RelayInfo) (int, error) {
	if value < 0 || math.IsNaN(value) || math.IsInf(value, 0) || math.Trunc(value) != value {
		return 0, fmt.Errorf("plugin returned invalid %s usage", field)
	}
	count, clamp := common.QuotaFromFloatChecked(value)
	if clamp != nil {
		info.QuotaClamp = clamp
		return 0, fmt.Errorf("plugin returned out-of-range %s usage", field)
	}
	return count, nil
}

func pluginAudioResponseError(err error) *types.NewAPIError {
	return types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusBadGateway, types.ErrOptionWithSkipRetry())
}

func (a *AudioAdaptor) GetModelList() []string { return append([]string(nil), a.plugin.Meta.Models...) }
func (a *AudioAdaptor) GetChannelName() string { return a.plugin.Meta.Name }
