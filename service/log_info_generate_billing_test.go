package service

import (
	"net/http/httptest"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestGenerateTextOtherInfoIncludesCharacterBilling(t *testing.T) {
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Set("billing_unit", "characters")
	ctx.Set("billing_characters", 29)
	now := time.Now()
	relayInfo := &relaycommon.RelayInfo{
		StartTime:         now,
		FirstResponseTime: now,
		ChannelMeta:       &relaycommon.ChannelMeta{},
	}

	other := GenerateTextOtherInfo(ctx, relayInfo, 3, 1, 1, 0, 0, 0, 1)

	assert.Equal(t, "characters", other["billing_unit"])
	assert.Equal(t, 29, other["billing_characters"])
}

func TestGenerateTextOtherInfoOmitsCharacterBillingForNormalRequests(t *testing.T) {
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	now := time.Now()
	relayInfo := &relaycommon.RelayInfo{
		StartTime:         now,
		FirstResponseTime: now,
		ChannelMeta:       &relaycommon.ChannelMeta{},
	}

	other := GenerateTextOtherInfo(ctx, relayInfo, 3, 1, 1, 0, 0, 0, 1)

	assert.NotContains(t, other, "billing_unit")
	assert.NotContains(t, other, "billing_characters")
}

func TestCharacterBilledTTSUsesTextInputRatio(t *testing.T) {
	quota, clamp := calculateAudioQuota(QuotaInfo{
		InputDetails: TokenDetails{TextTokens: 29},
		ModelName:    "cosyvoice-v3-flash",
		ModelRatio:   2,
		GroupRatio:   1,
	})

	assert.Nil(t, clamp)
	assert.Equal(t, 58, quota)
}
