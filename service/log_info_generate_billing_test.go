package service

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
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
	snapshot := other.Snapshot()

	assert.Equal(t, "characters", snapshot["billing_unit"])
	assert.Equal(t, 29, snapshot["billing_characters"])
}

func TestTieredTokenExpressionPreservesCharacterBillingUnit(t *testing.T) {
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Set("billing_unit", "characters")
	ctx.Set("billing_characters", 29)
	now := time.Now()
	relayInfo := &relaycommon.RelayInfo{
		StartTime:         now,
		FirstResponseTime: now,
		ChannelMeta:       &relaycommon.ChannelMeta{},
		TieredBillingSnapshot: &billingexpr.BillingSnapshot{
			ExprString: "tier(\"official_plus_50pct\", p * 150)",
		},
	}

	other := GenerateTextOtherInfo(ctx, relayInfo, 0, 1, 1, 0, 0, 0, 1)
	InjectTieredBillingInfo(other, relayInfo, &billingexpr.TieredResult{
		MatchedTier: "official_plus_50pct",
		BillingUnit: billingexpr.BillingUnitToken,
	})
	snapshot := other.Snapshot()

	assert.Equal(t, "characters", snapshot["billing_unit"])
	assert.Equal(t, 29, snapshot["billing_characters"])
	assert.Equal(t, "tiered_expr", snapshot["billing_mode"])
	assert.Equal(t, "official_plus_50pct", snapshot["matched_tier"])
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
	snapshot := other.Snapshot()

	assert.NotContains(t, snapshot, "billing_unit")
	assert.NotContains(t, snapshot, "billing_characters")
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
