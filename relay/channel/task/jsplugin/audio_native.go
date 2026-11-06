package jsplugin

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
)

// readNativeStream preserves provider SSE framing and cumulative usage. Once
// audio has reached the client, a broken stream retains its funded estimate.
func (a *AudioAdaptor) readNativeStream(c *gin.Context, response *http.Response, info *relaycommon.RelayInfo) (any, *types.NewAPIError) {
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 4096), maxPluginAudioResponseBytes)
	config := pluginruntime.EffectiveConfig(a.plugin.Meta.ConfigDefaults, info.ChannelSetting.TaskPluginConfig)
	var frame, data strings.Builder
	var measured *dto.Usage
	done, delivered := false, false
	total := 0
	for scanner.Scan() {
		line := scanner.Text()
		total += len(line) + 1
		if total > maxPluginAudioBytes {
			break
		}
		frame.WriteString(line)
		frame.WriteByte('\n')
		if value, found := strings.CutPrefix(line, "data:"); found {
			data.WriteString(strings.TrimPrefix(value, " "))
			data.WriteByte('\n')
		}
		if line != "" {
			continue
		}
		if data.Len() > 0 {
			var payload any
			if err := common.UnmarshalJsonStr(data.String(), &payload); err != nil {
				break
			}
			value, err := a.plugin.Engine.CallPath(context.WithoutCancel(c.Request.Context()), "protocols", []string{"openai_audio_speech", "parseResponse"}, map[string]any{
				"body": payload, "statusCode": response.StatusCode, "config": config, "requestBody": a.requestBody,
				"inputCharacters": info.GetEstimatePromptTokens(),
			})
			if err != nil {
				if !delivered {
					return nil, pluginAudioResponseError(err)
				}
				break
			}
			var parsed audioResponseDescriptor
			if err := convert(value, &parsed); err != nil {
				break
			}
			if parsed.Done {
				measured, err = a.normalizeUsage(c, info, parsed)
				if err != nil {
					break
				}
				done = true
			}
		}
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("X-Accel-Buffering", "no")
		if _, err := c.Writer.WriteString(frame.String()); err == nil {
			c.Writer.Flush()
		}
		delivered = true
		frame.Reset()
		data.Reset()
		if done {
			return measured, nil
		}
	}
	if !delivered {
		return nil, pluginAudioResponseError(fmt.Errorf("speech SSE ended before a complete response"))
	}
	logger.LogWarn(c, "Speech SSE ended after delivery without final usage; retaining reserved billing")
	// Estimate fallback leaves task usage facts at their reserved values.
	return &dto.Usage{PromptTokens: info.GetEstimatePromptTokens(), TotalTokens: info.GetEstimatePromptTokens()}, nil
}
