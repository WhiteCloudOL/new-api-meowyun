package controller

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	_ "github.com/QuantumNous/new-api/plugins"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newAlibabaTTSTestGateway(t *testing.T, upstream string) (*gin.Engine, *model.User, *model.Token) {
	t.Helper()
	user, token := setupResponsesWSRequestTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.Ability{}, &model.Log{}, &model.Option{}))
	require.NoError(t, i18n.Init())
	service.InitHttpClient()
	previous := config.GlobalConfig.ExportAllConfigs()
	previousBatch, previousLogs, previousQuota := common.BatchUpdateEnabled, common.LogConsumeEnabled, common.QuotaPerUnit
	common.BatchUpdateEnabled, common.LogConsumeEnabled, common.QuotaPerUnit = false, false, 500000
	t.Cleanup(func() {
		require.NoError(t, config.GlobalConfig.LoadFromDB(previous))
		common.BatchUpdateEnabled, common.LogConsumeEnabled, common.QuotaPerUnit = previousBatch, previousLogs, previousQuota
		model.InitChannelCache()
	})
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"billing_setting.billing_mode":    `{"cosyvoice-v3.5-plus":"tiered_expr","qwen3-tts-flash-realtime":"tiered_expr","qwen-audio-3.1-tts-flash":"tiered_expr","qwen-audio-3.1-tts-next":"tiered_expr","voice-enrollment":"tiered_expr"}`,
		"billing_setting.billing_expr":    `{"cosyvoice-v3.5-plus":"tier(\"characters\", p * 2)","qwen3-tts-flash-realtime":"tier(\"characters\", p * 2)","qwen-audio-3.1-tts-flash":"tier(\"tokens\", u(\"input_tokens\") * 0.000002 + u(\"output_tokens\") * 0.000004)","qwen-audio-3.1-tts-next":"tier(\"tokens\", u(\"input_tokens\") * 0.000002 + u(\"output_tokens\") * 0.000004)","voice-enrollment":"tier(\"operation\", u(\"requests\") * 0.000002)"}`,
		"group_ratio_setting.group_ratio": `{"default":1}`,
	}))
	operation_setting.GetQuotaSetting().PreConsumeMultiplier = 0.5
	operation_setting.GetQuotaSetting().EnableFreeModelPreConsume = false
	require.NoError(t, model.DB.Model(user).Updates(map[string]any{"quota": 1_000_000, "setting": `{"billing_preference":"wallet_only"}`}).Error)
	require.NoError(t, model.DB.Model(token).Update("remain_quota", 1_000_000).Error)
	channel := &model.Channel{Type: constant.ChannelTypeTaskPlugin, Name: "alibaba-native-test", Key: "provider-key", BaseURL: &upstream, Status: common.ChannelStatusEnabled, Group: "default", Models: "cosyvoice-v3.5-plus,qwen3-tts-flash-realtime,qwen-audio-3.1-tts-flash,qwen-audio-3.1-tts-next,voice-enrollment", Setting: common.GetPointer(`{"task_plugin_key":"alibaba-tts"}`)}
	channel.Models += ",next-alias"
	channel.ModelMapping = common.GetPointer(`{"next-alias":"qwen-audio-3.1-tts-next"}`)
	require.NoError(t, channel.Insert())
	model.InitChannelCache()
	engine := gin.New()
	engine.Use(middleware.BodyStorageCleanup(), middleware.TokenAuth(), func(c *gin.Context) {
		common.SetContextKey(c, constant.ContextKeyRequestStartTime, time.Now())
	})
	generation := jsplugin.DefaultRegistry.Generation()
	plugin, found := generation.Get("alibaba-tts")
	require.True(t, found)
	for _, route := range plugin.Meta.Routes {
		engine.POST(route.Path, func(c *gin.Context) {
			c.Set(jsplugin.ContextKeyPinnedRoute, jsplugin.PinnedRoute{Generation: generation, Plugin: plugin, Route: route})
		}, middleware.PrepareTaskPluginRoute(), middleware.Distribute(), func(c *gin.Context) { Relay(c, types.RelayFormatOpenAIAudio) })
	}
	engine.POST("/v1/audio/speech", middleware.PinTaskPluginEndpoint(), middleware.PrepareTaskPluginEndpoint(), middleware.Distribute(), func(c *gin.Context) { Relay(c, types.RelayFormatOpenAIAudio) })
	engine.GET("/api-ws/v1/inference", PluginSpeechWebSocket)
	engine.GET("/api-ws/v1/realtime", PluginSpeechWebSocket)
	return engine, user, token
}

func TestAlibabaTTSNativeHTTPBilling(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer provider-key", r.Header.Get("Authorization"))
		var body struct {
			Model string         `json:"model"`
			Input map[string]any `json:"input"`
		}
		if !assert.NoError(t, common.DecodeJson(r.Body, &body)) {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch body.Model {
		case "cosyvoice-v3.5-plus":
			if r.Header.Get("X-DashScope-SSE") == "enable" {
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = io.WriteString(w, "data: {\"output\":{\"audio\":{\"data\":\"YQ==\"}},\"usage\":{\"characters\":2}}\n\ndata: {\"output\":{\"audio\":{\"data\":\"Yg==\"}},\"usage\":{\"characters\":5}}\n\ndata: {\"output\":{\"finish_reason\":\"stop\"},\"usage\":{\"characters\":7}}\n\n")
				return
			}
			assert.EqualValues(t, 0, body.Input["volume"])
			_, _ = io.WriteString(w, `{"output":{"audio":{"url":"https://example.com/audio.wav"}},"usage":{"characters":3,"input_tokens":90,"output_tokens":80},"request_id":"native-json"}`)
		case "qwen-audio-3.1-tts-flash":
			if r.Header.Get("X-DashScope-SSE") == "enable" {
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = io.WriteString(w, "data: {\"output\":{\"audio\":{\"data\":\"YQ==\"}},\"usage\":{\"input_tokens\":12,\"output_tokens\":20}}\n\ndata: {\"output\":{\"finish_reason\":\"stop\"},\"usage\":{\"input_tokens\":12,\"output_tokens\":34}}\n\n")
				return
			}
			_, _ = io.WriteString(w, `{"output":{"audio":{"url":"https://example.com/audio.wav"}},"usage":{"input_tokens":12,"output_tokens":34,"characters":99}}`)
		case "qwen-audio-3.1-tts-next":
			assert.NotEmpty(t, body.Input["text_prompt"])
			assert.NotContains(t, body.Input, "voice")
			if body.Input["text_prompt"] == "compat" {
				_, _ = io.WriteString(w, `{"output":{"audio":{"data":"YXVkaW8="}},"usage":{"input_tokens":177,"output_tokens":320,"total_tokens":497,"duration":2}}`)
				return
			}
			_, _ = io.WriteString(w, `{"output":{"audio":{"url":"https://example.com/audio.wav","duration":5.2}},"usage":{"input_tokens":177,"output_tokens":320,"total_tokens":497,"duration":2}}`)
		case "voice-enrollment":
			if body.Input["action"] == "create_voice" || body.Input["action"] == "list_voice" {
				assert.NotEqual(t, "custom", body.Input["prefix"])
				assert.True(t, strings.HasPrefix(body.Input["prefix"].(string), "u"))
			}
			_, _ = io.WriteString(w, `{"output":{"voice_id":"provider-voice","status":"OK"},"usage":{"count":1}}`)
		default:
			http.Error(w, "unexpected model", http.StatusBadRequest)
		}
	}))
	defer upstream.Close()
	engine, user, token := newAlibabaTTSTestGateway(t, upstream.URL)
	voiceID := "cosyvoice-v3.5-plus-" + jsplugin.UserResourceScope(user.Id) + "-voice"
	for _, tc := range []struct {
		name, model, input, path string
		sse                      bool
		quota                    int
	}{
		{"native characters", "cosyvoice-v3.5-plus", `{"text":"你好","voice":"longxiaochun","volume":0}`, "/api/v1/services/audio/tts/SpeechSynthesizer", false, 3},
		{"native cumulative SSE", "cosyvoice-v3.5-plus", `{"text":"hello","voice":"longxiaochun"}`, "/api/v1/services/audio/tts/SpeechSynthesizer", true, 7},
		{"flash token facts", "qwen-audio-3.1-tts-flash", `{"text":"hello","voice":"Cherry"}`, "/api/v1/services/audio/tts/SpeechSynthesizer", false, 80},
		{"flash SSE token facts", "qwen-audio-3.1-tts-flash", `{"text":"hello","voice":"Cherry"}`, "/api/v1/services/audio/tts/SpeechSynthesizer", true, 80},
		{"next tokens", "qwen-audio-3.1-tts-next", `{"text_prompt":"Create a short podcast"}`, "/api/v1/services/audio/tts/SpeechSynthesizer", false, 817},
		{"mapped next tokens", "next-alias", `{"text_prompt":"Create a short podcast"}`, "/api/v1/services/audio/tts/SpeechSynthesizer", false, 817},
		{"create clone", "voice-enrollment", `{"action":"create_voice","target_model":"cosyvoice-v3.5-plus","prefix":"custom","audio":"https://example.com/voice.wav"}`, "/api/v1/services/audio/tts/customization", false, 1},
		{"create design", "voice-enrollment", `{"action":"create_voice","target_model":"cosyvoice-v3.5-plus","prefix":"custom","voice_prompt":"A warm female voice","preview_text":"Welcome to our show, thank you for listening"}`, "/api/v1/services/audio/tts/customization", false, 1},
		{"voice list", "voice-enrollment", `{"action":"list_voice"}`, "/api/v1/services/audio/tts/customization", false, 1},
		{"query own voice", "voice-enrollment", fmt.Sprintf(`{"action":"query_voice","voice_id":%q}`, voiceID), "/api/v1/services/audio/tts/customization", false, 1},
		{"update own voice", "voice-enrollment", fmt.Sprintf(`{"action":"update_voice","voice_id":%q,"audio":"https://example.com/voice.wav"}`, voiceID), "/api/v1/services/audio/tts/customization", false, 1},
		{"delete own voice", "voice-enrollment", fmt.Sprintf(`{"action":"delete_voice","voice_id":%q}`, voiceID), "/api/v1/services/audio/tts/customization", false, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before, err := model.GetUserQuota(user.Id, false)
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(fmt.Sprintf(`{"model":%q,"input":%s}`, tc.model, tc.input)))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Authorization", "Bearer sk-"+token.Key)
			if tc.sse {
				request.Header.Set("X-DashScope-SSE", "enable")
			}
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, request)
			require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
			assert.Contains(t, recorder.Body.String(), "output")
			after, err := model.GetUserQuota(user.Id, false)
			require.NoError(t, err)
			assert.Equal(t, tc.quota, before-after)
			var current model.Token
			require.NoError(t, model.DB.First(&current, token.Id).Error)
			assert.Equal(t, after, current.RemainQuota, "wallet and finite token settle together")
		})
	}
	before, err := model.GetUserQuota(user.Id, false)
	require.NoError(t, err)
	compat := httptest.NewRequest(http.MethodPost, "/v1/audio/speech", strings.NewReader(`{"model":"qwen-audio-3.1-tts-next","input":"compat","response_format":"wav"}`))
	compat.Header.Set("Content-Type", "application/json")
	compat.Header.Set("Authorization", "Bearer sk-"+token.Key)
	compatResult := httptest.NewRecorder()
	engine.ServeHTTP(compatResult, compat)
	require.Equal(t, http.StatusOK, compatResult.Code, compatResult.Body.String())
	assert.Equal(t, "audio", compatResult.Body.String())
	after, err := model.GetUserQuota(user.Id, false)
	require.NoError(t, err)
	assert.Equal(t, 817, before-after)
	// Usage-priced models follow the same explicit-free, zero-wallet contract.
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{"billing_setting.billing_expr": `{"qwen-audio-3.1-tts-next":"tier(\"free\", (u(\"input_tokens\") + u(\"output_tokens\")) * 0)"}`}))
	require.NoError(t, model.DB.Model(user).Update("quota", 0).Error)
	require.NoError(t, model.DB.Model(token).Update("unlimited_quota", true).Error)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/services/audio/tts/SpeechSynthesizer", strings.NewReader(`{"model":"qwen-audio-3.1-tts-next","input":{"text_prompt":"A short free podcast"}}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer sk-"+token.Key)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	quota, err := model.GetUserQuota(user.Id, false)
	require.NoError(t, err)
	assert.Zero(t, quota)
}

func TestAlibabaTTSNativeFailuresRefundAndEnforceVoiceAccess(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/v1/services/audio/tts/customization" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"code":"InvalidParameter","message":"invalid reference audio"}`)
			return
		}
		_, _ = io.WriteString(w, `{"output":{"audio":{"url":"https://example.com/audio.wav"}},"usage":{}}`)
	}))
	defer upstream.Close()
	engine, user, token := newAlibabaTTSTestGateway(t, upstream.URL)
	for _, tc := range []struct{ name, path, body string }{
		{"missing measured tokens", "/api/v1/services/audio/tts/SpeechSynthesizer", `{"model":"qwen-audio-3.1-tts-next","input":{"text_prompt":"A short podcast"}}`},
		{"another user's voice", "/api/v1/services/audio/tts/customization", `{"model":"voice-enrollment","input":{"action":"delete_voice","voice_id":"cosyvoice-v3.5-plus-u000000001-other"}}`},
		{"upstream rejected clone", "/api/v1/services/audio/tts/customization", `{"model":"voice-enrollment","input":{"action":"create_voice","target_model":"cosyvoice-v3.5-plus","prefix":"custom","audio":"https://example.com/voice.wav"}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Authorization", "Bearer sk-"+token.Key)
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, request)
			require.GreaterOrEqual(t, recorder.Code, http.StatusBadRequest, recorder.Body.String())
			quota, err := model.GetUserQuota(user.Id, false)
			require.NoError(t, err)
			assert.Equal(t, 1_000_000, quota)
			var current model.Token
			require.NoError(t, model.DB.First(&current, token.Id).Error)
			assert.Equal(t, 1_000_000, current.RemainQuota)
		})
	}
	// Permission to call voice-enrollment must not grant synthesis model access.
	require.NoError(t, model.DB.Model(token).Updates(map[string]any{"model_limits_enabled": true, "model_limits": "voice-enrollment"}).Error)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/services/audio/tts/customization", strings.NewReader(`{"model":"voice-enrollment","input":{"action":"create_voice","target_model":"cosyvoice-v3.5-plus","prefix":"custom","audio":"https://example.com/voice.wav"}}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer sk-"+token.Key)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusForbidden, recorder.Code, recorder.Body.String())
}

func TestAlibabaTTSNativeWebSocketTasks(t *testing.T) {
	finished := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		socket, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer socket.Close()
		_ = socket.SetReadDeadline(time.Now().Add(10 * time.Second))
		var event struct {
			Header struct{ Action, TaskID string } `json:"header"`
		}
		var first map[string]any
		_, encoded, err := socket.ReadMessage()
		if !assert.NoError(t, err) || !assert.NoError(t, common.Unmarshal(encoded, &first)) {
			return
		}
		header := first["header"].(map[string]any)
		id := header["task_id"].(string)
		assert.Equal(t, "run-task", header["action"])
		_ = socket.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"header":{"event":"task-started","task_id":%q},"payload":{}}`, id)))
		for {
			_, data, err := socket.ReadMessage()
			if !assert.NoError(t, err) || !assert.NoError(t, common.Unmarshal(data, &event)) {
				return
			}
			if event.Header.Action == "finish-task" {
				_ = socket.WriteMessage(websocket.BinaryMessage, []byte{1, 2, 3, 4})
				_ = socket.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"header":{"event":"task-finished","task_id":%q},"payload":{"usage":{"characters":4}}}`, id)))
				return
			}
		}
	}))
	defer upstream.Close()
	engine, user, token := newAlibabaTTSTestGateway(t, upstream.URL)
	// Observe handler completion so quota assertions do not race settlement.
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(finished)
		engine.ServeHTTP(w, r)
	}))
	defer gateway.Close()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(gateway.URL, "http")+"/api-ws/v1/inference", http.Header{"Authorization": {"Bearer sk-" + token.Key}})
	require.NoError(t, err)
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	for index := range 2 {
		id := fmt.Sprintf("speech-%d", index)
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"header":{"action":"run-task","task_id":%q,"streaming":"duplex"},"payload":{"task_group":"audio","task":"tts","function":"SpeechSynthesizer","model":"cosyvoice-v3.5-plus","parameters":{"voice":"longxiaochun"},"input":{}}}`, id))))
		_, data, err := conn.ReadMessage()
		require.NoError(t, err)
		require.Contains(t, string(data), "task-started")
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"header":{"action":"continue-task","task_id":%q},"payload":{"input":{"text":"你ab"}}}`, id))))
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"header":{"action":"finish-task","task_id":%q},"payload":{"input":{}}}`, id))))
		kind, audio, err := conn.ReadMessage()
		require.NoError(t, err)
		require.Equal(t, websocket.BinaryMessage, kind, string(audio))
		_, data, err = conn.ReadMessage()
		require.NoError(t, err)
		require.Contains(t, string(data), "task-finished")
	}
	require.NoError(t, conn.Close())
	select {
	case <-finished:
	case <-time.After(10 * time.Second):
		t.Fatal("speech handler did not finish")
	}
	quota, err := model.GetUserQuota(user.Id, false)
	require.NoError(t, err)
	assert.Equal(t, 1_000_000-8, quota)
}

func TestAlibabaTTSRealtimeUsageAndZeroBalance(t *testing.T) {
	for _, free := range []bool{false, true} {
		t.Run(fmt.Sprintf("free=%t", free), func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "qwen3-tts-flash-realtime", r.URL.Query().Get("model"))
				socket, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
				if !assert.NoError(t, err) {
					return
				}
				defer socket.Close()
				_ = socket.SetReadDeadline(time.Now().Add(10 * time.Second))
				_ = socket.WriteMessage(websocket.TextMessage, []byte(`{"type":"session.created","session":{"id":"session-one"}}`))
				for {
					_, data, err := socket.ReadMessage()
					if !assert.NoError(t, err) {
						return
					}
					var event map[string]any
					if !assert.NoError(t, common.Unmarshal(data, &event)) {
						return
					}
					switch event["type"] {
					case "session.update":
						_ = socket.WriteMessage(websocket.TextMessage, []byte(`{"type":"session.updated"}`))
					case "input_text_buffer.append":
						for _, frame := range []string{
							`{"type":"response.audio.delta","delta":"YQ=="}`,
							`{"type":"response.done","response":{"id":"first","usage":{"characters":2}}}`,
							`{"type":"response.done","response":{"id":"first","usage":{"characters":2}}}`,
							`{"type":"response.done","response":{"id":"second","usage":{"characters":3}}}`,
						} {
							_ = socket.WriteMessage(websocket.TextMessage, []byte(frame))
						}
					case "session.finish":
						_ = socket.WriteMessage(websocket.TextMessage, []byte(`{"type":"session.finished"}`))
						return
					}
				}
			}))
			defer upstream.Close()
			engine, user, token := newAlibabaTTSTestGateway(t, upstream.URL)
			starting := 1_000_000
			if free {
				starting = 0
				require.NoError(t, model.DB.Model(user).Update("quota", 0).Error)
				require.NoError(t, model.DB.Model(token).Updates(map[string]any{"remain_quota": 0, "unlimited_quota": true}).Error)
				require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{"billing_setting.billing_expr": `{"qwen3-tts-flash-realtime":"tier(\"free\", p * 0)"}`}))
			}
			finished := make(chan struct{})
			gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				defer close(finished)
				engine.ServeHTTP(w, r)
			}))
			defer gateway.Close()
			conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(gateway.URL, "http")+"/api-ws/v1/realtime?model=qwen3-tts-flash-realtime", http.Header{"Authorization": {"Bearer sk-" + token.Key}})
			require.NoError(t, err)
			defer conn.Close()
			_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
			_, data, err := conn.ReadMessage()
			require.NoError(t, err)
			require.Contains(t, string(data), "session.created")
			require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"session.update","session":{"voice":"Cherry","mode":"server_commit"}}`)))
			_, _, err = conn.ReadMessage()
			require.NoError(t, err)
			require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"input_text_buffer.append","text":"hello"}`)))
			for range 4 {
				_, _, err = conn.ReadMessage()
				require.NoError(t, err)
			}
			require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"session.finish"}`)))
			_, data, err = conn.ReadMessage()
			require.NoError(t, err)
			require.Contains(t, string(data), "session.finished")
			select {
			case <-finished:
			case <-time.After(10 * time.Second):
				t.Fatal("realtime handler did not finish")
			}
			quota, err := model.GetUserQuota(user.Id, false)
			require.NoError(t, err)
			want := starting - 5
			if free {
				want = 0
			}
			assert.Equal(t, want, quota)
		})
	}
}

func TestAlibabaTTSSpeechSocketFundsTextBeforeUpstream(t *testing.T) {
	for _, insufficient := range []bool{false, true} {
		t.Run(fmt.Sprintf("insufficient=%t", insufficient), func(t *testing.T) {
			forwarded := make(chan bool, 1)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				socket, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
				if !assert.NoError(t, err) {
					return
				}
				defer socket.Close()
				_ = socket.SetReadDeadline(time.Now().Add(10 * time.Second))
				_, _, err = socket.ReadMessage()
				if !assert.NoError(t, err) {
					return
				}
				_ = socket.WriteMessage(websocket.TextMessage, []byte(`{"header":{"event":"task-started","task_id":"funded"},"payload":{}}`))
				_, data, err := socket.ReadMessage()
				forwarded <- err == nil && strings.Contains(string(data), "continue-task")
				if err == nil {
					_ = socket.WriteMessage(websocket.BinaryMessage, []byte{1, 2})
					// Disconnect after delivery without a final usage event.
				}
			}))
			defer upstream.Close()
			engine, user, token := newAlibabaTTSTestGateway(t, upstream.URL)
			starting := 4
			if insufficient {
				starting = 3
			}
			require.NoError(t, model.DB.Model(user).Update("quota", starting).Error)
			require.NoError(t, model.DB.Model(token).Update("remain_quota", starting).Error)
			finished := make(chan struct{})
			gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				defer close(finished)
				engine.ServeHTTP(w, r)
			}))
			defer gateway.Close()
			conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(gateway.URL, "http")+"/api-ws/v1/inference", http.Header{"Authorization": {"Bearer sk-" + token.Key}})
			require.NoError(t, err)
			defer conn.Close()
			_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
			require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"header":{"action":"run-task","task_id":"funded"},"payload":{"task_group":"audio","task":"tts","function":"SpeechSynthesizer","model":"cosyvoice-v3.5-plus","parameters":{"voice":"longxiaochun"},"input":{}}}`)))
			_, data, err := conn.ReadMessage()
			require.NoError(t, err)
			require.Contains(t, string(data), "task-started")
			require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"header":{"action":"continue-task","task_id":"funded"},"payload":{"input":{"text":"你ab"}}}`)))
			if !insufficient {
				kind, _, err := conn.ReadMessage()
				require.NoError(t, err)
				require.Equal(t, websocket.BinaryMessage, kind)
			}
			_, data, err = conn.ReadMessage()
			require.NoError(t, err)
			require.Contains(t, string(data), "task-failed")
			select {
			case <-finished:
			case <-time.After(10 * time.Second):
				t.Fatal("funding handler did not finish")
			}
			assert.Equal(t, !insufficient, <-forwarded)
			quota, err := model.GetUserQuota(user.Id, false)
			require.NoError(t, err)
			if insufficient {
				assert.Equal(t, starting, quota, "unforwarded text must not be charged")
			} else {
				assert.Zero(t, quota, "delivered audio retains its funded input estimate")
			}
		})
	}
}
