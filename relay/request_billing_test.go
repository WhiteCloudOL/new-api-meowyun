package relay

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
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
		"billing_setting.billing_mode":    `{"cosyvoice-v3-flash":"tiered_expr"}`,
		"billing_setting.billing_expr":    `{"cosyvoice-v3-flash":"tier(\"characters\", p * 4)"}`,
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
