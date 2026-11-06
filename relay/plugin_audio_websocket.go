package relay

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"maps"
	"strings"
	"time"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/pkg/wsmanager"
	relaychannel "github.com/QuantumNous/new-api/relay/channel"
	audioplugin "github.com/QuantumNous/new-api/relay/channel/task/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type speechSocketMessage struct {
	kind int
	body []byte
	err  error
}

func readSpeechSocket(ctx context.Context, socket *websocket.Conn, messages chan<- speechSocketMessage) {
	for {
		kind, body, err := socket.ReadMessage()
		select {
		case messages <- speechSocketMessage{kind: kind, body: body, err: err}:
		case <-ctx.Done():
			return
		}
		if err != nil {
			return
		}
	}
}

// PluginSpeechWebSocketHelper runs a fresh authenticated, rate-limited billing
// request for every native speech task. The vendor's frames remain unchanged.
func PluginSpeechWebSocketHelper(c *gin.Context, client *websocket.Conn, runner ResponsesWSRequestRunner) {
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	client.SetReadLimit(1 << 20)
	messages := make(chan speechSocketMessage, 1)
	go readSpeechSocket(ctx, client, messages)
	queryModel := c.Query("model")
	if strings.HasSuffix(c.Request.URL.Path, "/realtime") && queryModel == "" {
		writeSpeechSocketError(client, true, "", types.NewError(fmt.Errorf("model query parameter is required"), types.ErrorCodeInvalidRequest))
		return
	}
	if strings.HasSuffix(c.Request.URL.Path, "/inference") {
		queryModel = ""
	}
	for {
		plugin, exists := pluginruntime.DefaultRegistry.Generation().Get("alibaba-tts")
		if !exists {
			return
		}
		var first []byte
		if queryModel != "" {
			first = []byte(`{"type":"session.update","session":{"voice":"Cherry"}}`)
		} else {
			select {
			case incoming := <-messages:
				if incoming.err != nil || incoming.kind != websocket.TextMessage {
					return
				}
				first = incoming.body
			case <-ctx.Done():
				return
			case <-time.After(30 * time.Second):
				return
			}
		}
		var event any
		if common.Unmarshal(first, &event) != nil {
			writeSpeechSocketError(client, queryModel != "", "", types.NewError(fmt.Errorf("invalid speech JSON event"), types.ErrorCodeInvalidRequest))
			return
		}
		requestedModel := queryModel
		if object, ok := event.(map[string]any); ok && requestedModel == "" {
			if payload, ok := object["payload"].(map[string]any); ok {
				requestedModel, _ = payload["model"].(string)
			}
		}
		served, declared, allowed := model.ResolveTaskPluginModel(pluginruntime.DefaultRegistry.Generation(), requestedModel, plugin.Meta.Models)
		if !allowed {
			writeSpeechSocketError(client, queryModel != "", "", types.NewError(fmt.Errorf("unsupported speech model"), types.ErrorCodeInvalidRequest))
			return
		}
		value, err := plugin.Engine.CallPath(ctx, "native", []string{"socketStart"}, map[string]any{"event": event, "queryModel": queryModel, "model": served, "upstreamModel": declared})
		if err != nil {
			writeSpeechSocketError(client, queryModel != "", "", types.NewError(err, types.ErrorCodeInvalidRequest))
			return
		}
		requestBody, ok := value.(map[string]any)
		if !ok {
			return
		}
		modelName, _ := requestBody["model"].(string)
		request := &dto.AudioRequest{Model: modelName}
		encoded, err := common.Marshal(request)
		if err != nil {
			return
		}
		httpRequest := c.Request.Clone(ctx)
		httpRequest.Body = io.NopCloser(bytes.NewReader(encoded))
		httpRequest.ContentLength = int64(len(encoded))
		requestID := common.GetTimeString() + common.GetRandomString(8)
		apiErr := runner(httpRequest, requestID, func(task *gin.Context) *types.NewAPIError {
			return runPluginSpeechTask(task, client, messages, plugin, requestBody, request, queryModel != "")
		})
		if apiErr != nil {
			writeSpeechSocketError(client, queryModel != "", requestBody["taskId"], apiErr)
			return
		}
		if queryModel != "" {
			return
		}
	}
}

func writeSpeechSocketError(client *websocket.Conn, realtime bool, taskID any, apiErr *types.NewAPIError) {
	errorBody := map[string]any{"header": map[string]any{"event": "task-failed", "task_id": taskID, "error_code": apiErr.GetErrorCode(), "error_message": apiErr.Error()}}
	if realtime {
		errorBody = map[string]any{"type": "error", "error": map[string]any{"code": apiErr.GetErrorCode(), "message": apiErr.Error()}}
	}
	payload, _ := common.Marshal(errorBody)
	_ = client.SetWriteDeadline(time.Now().Add(10 * time.Second))
	_ = client.WriteMessage(websocket.TextMessage, payload)
}

func runPluginSpeechTask(c *gin.Context, client *websocket.Conn, incoming <-chan speechSocketMessage, plugin *pluginruntime.LoadedPlugin, body map[string]any, request *dto.AudioRequest, realtime bool) *types.NewAPIError {
	if apiErr := checkResponsesWSModelAccess(c, request.Model); apiErr != nil {
		return apiErr
	}
	c.Set("resolved_task_model", request.Model)
	c.Set("expected_task_plugin_key", plugin.Meta.Key)
	service.AppendTaskPluginIdentityFilter(c, plugin.Meta.Key)
	retry := &service.RetryParam{Ctx: c, ModelName: request.Model, TokenGroup: common.GetContextKeyString(c, constant.ContextKeyUsingGroup), Retry: common.GetPointer(0)}
	channel, _, selectErr := service.SelectChannelForRequest(c, request.Model, retry)
	if selectErr != nil {
		return types.NewErrorWithStatusCode(fmt.Errorf("%s", selectErr.Message), types.ErrorCodeGetChannelFailed, selectErr.StatusCode)
	}
	if apiErr := middleware.SetupContextForSelectedChannel(c, channel, request.Model); apiErr != nil {
		return apiErr
	}
	info := relaycommon.GenRelayInfoOpenAIAudio(c, request)
	info.RelayMode = relayconstant.RelayModeAudioSpeech
	info.IsStream = true
	info.InitChannelMeta(c)
	if err := helper.ModelMappedHelper(c, info, request); err != nil {
		return types.NewError(err, types.ErrorCodeChannelModelMappedError)
	}
	body = maps.Clone(body)
	body["providerModel"] = info.UpstreamModelName
	c.Set(pluginruntime.ContextKeyPinnedEndpoint, pluginruntime.PinnedEndpoint{Plugin: plugin, Protocol: "openai_audio_speech", Model: info.OriginModelName})
	c.Set("task_request", body)
	frozenBody, _ := common.Marshal(body["event"])
	info.BillingRequestInput = &billingexpr.RequestInput{Body: frozenBody, Headers: info.RequestHeaders}
	if apiErr := PrepareRequestBilling(c, info); apiErr != nil {
		return apiErr
	}
	completed, delivered, submitted := false, false, false
	var actual *dto.Usage
	defer func() {
		if !completed && !delivered && !submitted {
			if info.Billing != nil {
				info.Billing.Refund(c)
			}
			return
		}
		if actual == nil || !completed {
			actual = &dto.Usage{PromptTokens: info.GetEstimatePromptTokens(), TotalTokens: info.GetEstimatePromptTokens()}
		}
		if actual.CompletionTokenDetails.AudioTokens > 0 {
			service.PostAudioConsumeQuota(c, info, actual, nil)
		} else {
			service.PostTextConsumeQuota(c, info, actual, nil)
		}
	}()
	adaptor := audioplugin.NewAudio(plugin)
	defer adaptor.Close()
	first, err := adaptor.BuildSocket(c, info, body)
	if err != nil {
		return types.NewError(err, types.ErrorCodeConvertRequestFailed)
	}
	target, err := relaychannel.DoWssRequest(adaptor, c, info, nil)
	if err != nil {
		return types.NewError(err, types.ErrorCodeDoRequestFailed)
	}
	defer target.Close()
	unregister := wsmanager.Register(channel.Id, wsmanager.KindRealtime, func(_ string) {
		_ = client.Close()
		_ = target.Close()
	})
	defer unregister()
	if !realtime {
		_ = target.SetWriteDeadline(time.Now().Add(30 * time.Second))
		if err := target.WriteMessage(websocket.TextMessage, first); err != nil {
			return types.NewError(err, types.ErrorCodeDoRequestFailed)
		}
	}
	target.SetReadLimit(8 << 20)
	streamCtx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Minute)
	defer cancel()
	upstream := make(chan speechSocketMessage, 1)
	go readSpeechSocket(streamCtx, target, upstream)
	text := ""
	measurements := map[string]float64{}
	seenUsage := map[string]bool{}
	for {
		select {
		case message := <-incoming:
			if message.err != nil || message.kind != websocket.TextMessage {
				return types.NewError(fmt.Errorf("speech client disconnected"), types.ErrorCodeDoRequestFailed)
			}
			var event any
			if err := common.Unmarshal(message.body, &event); err != nil {
				return types.NewError(err, types.ErrorCodeInvalidRequest)
			}
			value, err := plugin.Engine.CallPath(streamCtx, "native", []string{"socketClient"}, map[string]any{
				"event": event, "requestBody": body, "userScope": pluginruntime.UserResourceScope(info.UserId),
			})
			if err != nil {
				return types.NewError(err, types.ErrorCodeInvalidRequest)
			}
			decoded, _ := value.(map[string]any)
			if fragment, _ := decoded["text"].(string); fragment != "" {
				text += fragment
				if len(text) > 80000 {
					return types.NewError(fmt.Errorf("speech input exceeds the task limit"), types.ErrorCodeInvalidRequest)
				}
				if err := reserveSpeechText(c, info, text); err != nil {
					return types.NewError(err, types.ErrorCodeInsufficientUserQuota)
				}
				submitted = true
			}
			_ = target.SetWriteDeadline(time.Now().Add(30 * time.Second))
			if err := target.WriteMessage(message.kind, message.body); err != nil {
				return types.NewError(err, types.ErrorCodeDoRequestFailed)
			}
		case message := <-upstream:
			if message.err != nil {
				return types.NewError(fmt.Errorf("upstream speech socket ended before completion"), types.ErrorCodeBadResponse)
			}
			done, failed := false, false
			if message.kind == websocket.BinaryMessage {
				delivered = true
			} else {
				var event any
				if common.Unmarshal(message.body, &event) != nil {
					return types.NewError(fmt.Errorf("invalid speech event"), types.ErrorCodeBadResponse)
				}
				value, err := plugin.Engine.CallPath(streamCtx, "native", []string{"socketServer"}, map[string]any{"event": event, "requestBody": body})
				if err != nil {
					return types.NewError(err, types.ErrorCodeBadResponse)
				}
				var decoded struct {
					Done       bool               `json:"done"`
					Failed     bool               `json:"failed"`
					Audio      bool               `json:"audio"`
					Cumulative bool               `json:"cumulative"`
					UsageID    string             `json:"usageId"`
					Usage      map[string]float64 `json:"usage"`
				}
				encoded, err := common.Marshal(value)
				if err != nil || common.Unmarshal(encoded, &decoded) != nil {
					return types.NewError(fmt.Errorf("invalid speech usage event"), types.ErrorCodeBadResponse)
				}
				done, failed = decoded.Done, decoded.Failed
				if decoded.Audio {
					delivered = true
				}
				if usage := decoded.Usage; usage != nil {
					id, cumulative := decoded.UsageID, decoded.Cumulative
					if cumulative || !seenUsage[id] {
						for _, key := range []string{"characters", "input_tokens", "output_tokens"} {
							if number, ok := usage[key]; ok {
								if number < 0 || number > common.MaxQuota || !cumulative && measurements[key] > common.MaxQuota-number {
									return types.NewError(fmt.Errorf("invalid speech usage"), types.ErrorCodeBadResponse)
								}
								if cumulative {
									measurements[key] = max(measurements[key], number)
								} else {
									measurements[key] += number
								}
							}
						}
						seenUsage[id] = true
					}
				}
			}
			if done {
				if len(measurements) == 0 && (delivered || submitted) {
					return types.NewError(fmt.Errorf("speech completed without usage"), types.ErrorCodeBadResponse)
				}
				if info.UpstreamModelName == "qwen-audio-3.1-tts-flash" {
					_, inputMeasured := measurements["input_tokens"]
					_, outputMeasured := measurements["output_tokens"]
					if !inputMeasured || !outputMeasured {
						return types.NewError(fmt.Errorf("speech completed without input/output token usage"), types.ErrorCodeBadResponse)
					}
					actual, err = adaptor.MeasureUsage(c, info, map[string]any{"usage": map[string]any{"facts": map[string]any{"input_tokens": measurements["input_tokens"], "output_tokens": measurements["output_tokens"]}}})
				} else {
					actual, err = adaptor.MeasureUsage(c, info, map[string]any{"usage": map[string]any{"characters": measurements["characters"]}})
				}
				if err != nil {
					return types.NewError(err, types.ErrorCodeBadResponse)
				}
				completed = true
			}
			_ = client.SetWriteDeadline(time.Now().Add(30 * time.Second))
			if err := client.WriteMessage(message.kind, message.body); err != nil {
				return nil
			}
			if failed {
				if !delivered {
					submitted = false
				}
				return nil
			}
			if done {
				return nil
			}
		case <-streamCtx.Done():
			return types.NewError(fmt.Errorf("speech session timed out"), types.ErrorCodeDoRequestFailed)
		}
	}
}

func reserveSpeechText(c *gin.Context, info *relaycommon.RelayInfo, text string) error {
	characters := 0
	for _, char := range text {
		characters++
		if unicode.Is(unicode.Han, char) {
			characters++
		}
	}
	var quota int
	var beforeGroup float64
	var request billingexpr.RequestInput
	if snap := info.TieredBillingSnapshot; snap != nil {
		if snap.SkipPreConsumeForZeroCost {
			info.SetEstimatePromptTokens(characters)
			return nil
		}
		request = *info.BillingRequestInput
		if snap.TaskUsageBilling {
			request.Usage = maps.Clone(request.Usage)
			request.Usage["input_tokens"] = float64(len(text))
		}
		cost, trace, err := billingexpr.RunExprByHashWithRequest(snap.ExprString, snap.ExprHash, billingexpr.TokenParams{P: float64(characters), Len: float64(characters)}, request)
		if err != nil {
			return err
		}
		beforeGroup = cost * snap.QuotaPerUnit
		if !snap.TaskUsageBilling {
			beforeGroup /= 1_000_000
		}
		if !snap.TaskUsageBilling && trace.BillingUnit != billingexpr.BillingUnitRequest {
			beforeGroup *= max(1, snap.PreConsumeMultiplier)
		}
		quota, err = common.QuotaRoundStrict(beforeGroup * snap.GroupRatio)
		if err != nil {
			return err
		}
	} else if info.PriceData.UsePrice {
		quota = info.PriceData.QuotaToPreConsume
	} else {
		multiplier, err := operation_setting.InputPreConsumeMultiplier()
		if err != nil {
			return err
		}
		quota, err = common.QuotaFromFloatStrict(float64(characters) * info.PriceData.ModelRatio * info.PriceData.GroupRatioInfo.GroupRatio * max(1, multiplier))
		if err != nil {
			return err
		}
	}
	if quota == 0 && info.PriceData.FreeModel {
		info.SetEstimatePromptTokens(characters)
		return nil
	}
	if apiErr := service.PreConsumeBilling(c, quota, info); apiErr != nil {
		return apiErr
	}
	info.SetEstimatePromptTokens(characters)
	if snap := info.TieredBillingSnapshot; snap != nil {
		snap.EstimatedPromptTokens, snap.EstimatedQuotaBeforeGroup, snap.EstimatedQuotaAfterGroup = characters, beforeGroup, quota
		info.BillingRequestInput.Usage = request.Usage
	}
	return nil
}
