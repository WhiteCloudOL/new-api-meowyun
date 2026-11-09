package relay

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type speechInputReservation struct{ held, available int }

func (s *speechInputReservation) Settle(int) error         { return nil }
func (s *speechInputReservation) Refund(*gin.Context)      {}
func (s *speechInputReservation) NeedsRefund() bool        { return false }
func (s *speechInputReservation) GetPreConsumedQuota() int { return s.held }
func (s *speechInputReservation) Reserve(n int) error      { return s.ReserveBeforeSubmit(n) }
func (s *speechInputReservation) ReserveBeforeSubmit(n int) error {
	if n > s.available {
		return fmt.Errorf("insufficient speech balance")
	}
	s.held = max(s.held, n)
	return nil
}

func TestCharacterSpeechReservesActualInput(t *testing.T) {
	require.NoError(t, i18n.Init())
	previous := config.GlobalConfig.ExportAllConfigs()
	previousRatios := ratio_setting.ModelRatio2JSONString()
	previousCount := constant.CountToken
	t.Cleanup(func() {
		require.NoError(t, config.GlobalConfig.LoadFromDB(previous))
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(previousRatios))
		constant.CountToken = previousCount
	})
	constant.CountToken = false
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"qwen3-tts-flash":2}`))
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"billing_setting.billing_mode":    `{"cosyvoice-v3-flash":"tiered_expr","breeze-tts-2":"tiered_expr"}`,
		"billing_setting.billing_expr":    `{"cosyvoice-v3-flash":"tier(\"characters\", p * 4)","breeze-tts-2":"tier(\"characters\", p * 4)"}`,
		"group_ratio_setting.group_ratio": `{"default":1}`,
	}))
	// A discounted optional estimate must not admit underfunded known input.
	operation_setting.GetQuotaSetting().PreConsumeMultiplier = 0.5
	for _, tc := range []struct {
		name, model, input string
		characters         int
		insufficient       bool
	}{
		{"short input has no 100-character minimum", "cosyvoice-v3-flash", "hello", 5, false},
		{"Unicode characters not bytes or tokens", "cosyvoice-v3-flash", "你好🌟", 3, false},
		{"long input is not capped at 100", "cosyvoice-v3-flash", strings.Repeat("你", 200), 200, false},
		{"legacy character pricing", "qwen3-tts-flash", "你好🌟", 3, false},
		{"BreezeTTS weights Han characters twice", relaycommon.BreezeSpeechModel, "你A🌟", 4, false},
		{"expression insufficient balance", "cosyvoice-v3-flash", "hello", 5, true},
		{"legacy insufficient balance", "qwen3-tts-flash", "hello", 5, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/audio/speech", nil)
			reservation := &speechInputReservation{available: tc.characters * 2}
			if tc.insufficient {
				reservation.available--
			}
			request := &dto.AudioRequest{Model: tc.model, Input: tc.input, Voice: "fixture"}
			info := &relaycommon.RelayInfo{Request: request, OriginModelName: tc.model, UsingGroup: "default", UserGroup: "default",
				RelayFormat: types.RelayFormatOpenAIAudio, Billing: reservation, BillingRequestInput: &billingexpr.RequestInput{}}
			apiErr := PrepareRequestBilling(c, info)
			if tc.insufficient {
				require.NotNil(t, apiErr)
				assert.Equal(t, http.StatusForbidden, apiErr.StatusCode)
				assert.Zero(t, reservation.held)
				return
			}
			require.Nil(t, apiErr)
			assert.Equal(t, tc.characters*2, reservation.held)
			assert.Equal(t, tc.characters, info.GetEstimatePromptTokens())
			assert.False(t, info.EnforceTextBudget)
			assert.True(t, info.ForcePreConsume)
			require.NoError(t, helper.ReserveTextOutputQuota(c, info, []byte(`{}`)))
			assert.Equal(t, tc.characters*2, reservation.held, "speech never reserves 100K output tokens")
			assert.Equal(t, tc.input, request.Input)
		})
	}
}

func TestTieredZeroBalanceAdmission(t *testing.T) {
	require.NoError(t, i18n.Init())
	db := setupRelayChannelDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	user := model.User{Username: "zero-balance"}
	require.NoError(t, db.Create(&user).Error)
	previous := config.GlobalConfig.ExportAllConfigs()
	previousRedis := common.RedisEnabled
	t.Cleanup(func() {
		require.NoError(t, config.GlobalConfig.LoadFromDB(previous))
		common.RedisEnabled = previousRedis
	})
	common.RedisEnabled = false

	for _, tc := range []struct {
		name, expr, body, outgoing string
		speech, image              bool
		preConsume, allow          bool
	}{
		{name: "zero character price", expr: `tier("characters", p * 0)`, speech: true, allow: true},
		{name: "zero token prices across tiers", expr: `len < 10 ? tier("short", p * 0 + c * 0) : tier("long", cr * 0 + cc12h * 0)`, allow: true},
		{name: "zero fixed price", expr: `tier("request", fixed(0))`, allow: true},
		{name: "zero image price at any quantity", expr: `tier("image", fixed(0)) * image_count`, image: true, allow: true},
		{name: "free tier selected by frozen request", expr: `param("free") == true ? tier("free", fixed(0)) : tier("paid", fixed(1))`, body: `{"free":true}`, allow: true},
		{name: "pre-consume enabled", expr: `tier("characters", p * 0)`, preConsume: true},
		{name: "positive price rounds to zero", expr: `tier("request", fixed(0.00000001))`},
		{name: "zero estimate with billable usage possible", expr: `tier("output", c * 4)`},
		{name: "actual context length can select a paid tier", expr: `len <= 100 ? tier("free", fixed(0)) : tier("paid", fixed(1))`},
		{name: "actual image quantity can select a paid tier", expr: `image_count == 1 ? tier("free", fixed(0)) : tier("paid", fixed(1))`, image: true},
		{name: "separately billed tools require funding", expr: `tier("request", fixed(0))`, body: `{"web_search_options":{}}`},
		{name: "channel override adds separately billed tools", expr: `tier("request", fixed(0))`, outgoing: `{"tools":[{"type":"web_search"}]}`, allow: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			modelName, path, format := "zero-price-fixture", "/v1/chat/completions", types.RelayFormatOpenAI
			var request dto.Request = &dto.GeneralOpenAIRequest{Model: modelName}
			if tc.speech {
				modelName, path, format = relaycommon.BreezeSpeechModel, "/v1/audio/speech", types.RelayFormatOpenAIAudio
				request = &dto.AudioRequest{Model: modelName, Input: "你A🌟"}
			} else if tc.image {
				path, format = "/v1/images/generations", types.RelayFormatOpenAIImage
				request = &dto.ImageRequest{Model: modelName}
			}
			expr, err := common.Marshal(map[string]string{modelName: tc.expr})
			require.NoError(t, err)
			require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
				"billing_setting.billing_mode":    `{"breeze-tts-2":"tiered_expr","zero-price-fixture":"tiered_expr"}`,
				"billing_setting.billing_expr":    string(expr),
				"group_ratio_setting.group_ratio": `{"default":1,"retry":2}`,
			}))
			operation_setting.GetQuotaSetting().EnableFreeModelPreConsume = tc.preConsume
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, path, nil)
			info := &relaycommon.RelayInfo{
				Request: request, OriginModelName: modelName, UserId: user.Id, UsingGroup: "default", UserGroup: "default",
				UserSetting: dto.UserSetting{BillingPreference: "wallet_only"}, RelayFormat: format,
				BillingRequestInput: &billingexpr.RequestInput{Body: []byte(tc.body)},
			}
			apiErr := PrepareRequestBilling(c, info)
			if !tc.allow {
				require.NotNil(t, apiErr)
				assert.Equal(t, types.ErrorCodeInsufficientUserQuota, apiErr.GetErrorCode())
				return
			}
			require.Nil(t, apiErr)
			require.Nil(t, service.PrepareTieredBillingForSelectedGroup(c, info))
			info.PriceData.GroupRatioInfo.GroupRatio = 2
			require.Nil(t, service.PrepareTieredBillingForSelectedGroup(c, info))
			if tc.outgoing != "" {
				var budgetErr *types.NewAPIError
				require.ErrorAs(t, helper.ReserveTextOutputQuota(c, info, []byte(tc.outgoing)), &budgetErr)
				assert.Equal(t, types.ErrorCodeInsufficientUserQuota, budgetErr.GetErrorCode())
				return
			}
			require.NoError(t, helper.ReserveTextOutputQuota(c, info, []byte(`{}`)))
			if tc.image {
				require.Nil(t, service.PrepareImageBillingForRequest(c, info, 3))
			}
			assert.Nil(t, info.Billing)
			ok, actual, _ := service.TryTieredSettle(info, billingexpr.TokenParams{P: 200, C: 100, Len: 200, CC12h: 10})
			assert.True(t, ok)
			assert.Zero(t, actual)
		})
	}

	t.Run("task completion may change billable usage", func(t *testing.T) {
		operation_setting.GetQuotaSetting().EnableFreeModelPreConsume = false
		service.InitHttpClient()
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{}`))
		}))
		t.Cleanup(upstream.Close)
		plugin := strings.Replace(billingFallbackPlugin, `fetchMode:"per_task"`, `fetchMode:"per_task", usageSchema:{units:{type:"number",unit:"count"}}`, 1) + `
export function extractUsage(){return {units:0};}
`
		for _, tc := range []struct {
			name, expr string
			allow      bool
		}{
			{name: "zero price", expr: `tier("free", u("units") * 0)`, allow: true},
			{name: "zero estimate", expr: `tier("paid", u("units"))`},
		} {
			t.Run(tc.name, func(t *testing.T) {
				expr, err := common.Marshal(map[string]string{"declared-model": tc.expr})
				require.NoError(t, err)
				require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
					"billing_setting.billing_mode": `{"declared-model":"tiered_expr"}`,
					"billing_setting.billing_expr": string(expr),
				}))
				c, info := newTaskSubmitContext(t, "declared-model", "")
				pinMappingOrderPlugin(t, c, plugin)
				common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, upstream.URL)
				info.OriginModelName, info.UsingGroup, info.UserGroup = "declared-model", "default", "default"
				info.UserId = user.Id
				info.UserSetting.BillingPreference = "wallet_only"

				result, taskErr := RelayTaskSubmit(c, info)
				if !tc.allow {
					require.NotNil(t, taskErr)
					assert.Equal(t, string(types.ErrorCodeInsufficientUserQuota), taskErr.Code)
					return
				}
				require.Nil(t, taskErr)
				assert.Zero(t, result.Quota)
				settlement, _, err := service.EvaluateTaskCompletionUsage(info.TieredBillingSnapshot, map[string]any{"units": float64(10)})
				require.NoError(t, err)
				assert.Zero(t, settlement.ActualQuotaAfterGroup)
			})
		}
	})
}
