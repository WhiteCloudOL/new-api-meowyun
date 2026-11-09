package controller

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpstreamPrivacyPublicResponses(t *testing.T) {
	setting := operation_setting.GetGeneralSetting()
	previous := setting.HideUpstreamInfo
	t.Cleanup(func() { setting.HideUpstreamInfo = previous })
	for _, hidden := range []bool{false, true} {
		t.Run(map[bool]string{false: "visible", true: "hidden"}[hidden], func(t *testing.T) {
			setting.HideUpstreamInfo = hidden
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
			common.SetContextKey(ctx, constant.ContextKeyChannelName, "PrivateProvider")
			original := types.NewOpenAIError(errors.New("PrivateProvider failed; visit https://support.private-provider.example/errors"), types.ErrorCodeBadResponseStatusCode, 429)
			client := service.ClientRelayError(ctx, original).ToOpenAIError()
			assert.Contains(t, original.Error(), "PrivateProvider")
			assert.Equal(t, 429, service.ClientRelayError(ctx, original).StatusCode)
			if hidden {
				assert.NotContains(t, client.Message, "PrivateProvider")
				assert.NotContains(t, client.Message, "https://")
			} else {
				assert.Contains(t, client.Message, "PrivateProvider")
			}
			assert.Equal(t, !hidden, service.ShouldCopyUpstreamHeader(ctx, "Server", []string{"PrivateProvider"}))
			assert.Equal(t, !hidden, service.ShouldCopyUpstreamHeader(ctx, "Link", []string{"<https://provider.example/docs>"}))
			assert.True(t, service.ShouldCopyUpstreamHeader(ctx, "X-Sample-Rate", []string{"24000"}))
			assert.True(t, service.ShouldCopyUpstreamHeader(ctx, "Retry-After", []string{"5"}))
			meta := buildOpenAIModel("client-model", map[string]string{"client-model": "PrivateProvider"})
			if hidden {
				assert.Equal(t, "new-api", meta.OwnedBy)
			} else {
				assert.Equal(t, "PrivateProvider", meta.OwnedBy)
			}
			input := []byte(`{"id":"unchanged","model":"client-model","provider":"PrivateProvider","provider_url":"https://provider.example","usage":{"prompt_tokens":9223372036854775806},"choices":[{"message":{"content":"Read https://reference.example in the answer"}}]}`)
			projected := service.ClientResponseJSON(input)
			if hidden {
				assert.NotContains(t, string(projected), "PrivateProvider")
				assert.NotContains(t, string(projected), "provider.example")
			} else {
				assert.Equal(t, string(input), string(projected))
			}
			assert.Contains(t, string(projected), "https://reference.example")
			assert.Contains(t, string(projected), "9223372036854775806")
			require.NoError(t, helper.StringData(ctx, string(input)))
			if hidden {
				assert.NotContains(t, recorder.Body.String(), "PrivateProvider")
			} else {
				assert.Contains(t, recorder.Body.String(), "PrivateProvider")
			}
			assert.Contains(t, recorder.Body.String(), "https://reference.example")
		})
	}
}

func TestUpstreamPrivacyUserLogsKeepAdministratorDiagnostics(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	setting := operation_setting.GetGeneralSetting()
	previous := setting.HideUpstreamInfo
	setting.HideUpstreamInfo = true
	t.Cleanup(func() { setting.HideUpstreamInfo = previous })
	entry := &model.Log{UserId: 1, TokenId: 19, ChannelId: 22, Type: model.LogTypeError, Content: "PrivateProvider failed: https://provider.example/help", UpstreamRequestId: "private-trace", Other: `{"task_plugin":{"name":"PrivateProvider","author":{"url":"https://provider.example"}},"upstream_model_name":"private-model","billing_characters":3,"admin_info":{"private":"diagnostic"}}`}
	require.NoError(t, db.Create(entry).Error)
	logs, err := model.GetLogByTokenId(19)
	require.NoError(t, err)
	require.Len(t, logs, 1)
	assert.Zero(t, logs[0].ChannelId)
	assert.Empty(t, logs[0].UpstreamRequestId)
	assert.NotContains(t, logs[0].Content, "PrivateProvider")
	assert.NotContains(t, logs[0].Content, "https://")
	assert.NotContains(t, logs[0].Other, "task_plugin")
	assert.Contains(t, logs[0].Other, `"billing_characters":3`)
	var stored model.Log
	require.NoError(t, db.First(&stored, entry.Id).Error)
	assert.Contains(t, stored.Content, "PrivateProvider")
	assert.Contains(t, stored.Other, "diagnostic")
	assert.Equal(t, "[provider] failed [redacted]", common.RedactProviderText("PrivateProvider failed https://provider.example/help", "PrivateProvider"))
	assert.False(t, strings.Contains(logs[0].Other, "provider.example"))
}

func TestUpstreamPrivacyPricingDoesNotMutateAdministratorCatalog(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.Create(&model.Vendor{Id: 7, Name: "PrivateProvider", Icon: "OpenAI", Status: 1}).Error)
	require.NoError(t, db.Create(&model.Model{ModelName: "private-model", Description: "PrivateProvider docs https://provider.example/help", VendorID: 7, Status: 1}).Error)
	require.NoError(t, db.Create(&model.Channel{Id: 9, Type: 1, Name: "PrivateProvider", Models: "private-model", Group: "default", Status: 1}).Error)
	require.NoError(t, db.Create(&model.Ability{Group: "default", Model: "private-model", ChannelId: 9, Enabled: true}).Error)
	model.InvalidatePricingCache()
	t.Cleanup(model.InvalidatePricingCache)
	setting := operation_setting.GetGeneralSetting()
	previous := setting.HideUpstreamInfo
	setting.HideUpstreamInfo = true
	t.Cleanup(func() { setting.HideUpstreamInfo = previous })
	for _, role := range []int{1, 100} {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest("GET", "/api/pricing", nil)
		ctx.Set("role", role)
		GetPricing(ctx)
		var body struct {
			Data    []model.Pricing       `json:"data"`
			Vendors []model.PricingVendor `json:"vendors"`
		}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Data, 1)
		assert.Equal(t, "private-model", body.Data[0].ModelName)
		if role == 1 {
			assert.Empty(t, body.Vendors)
			assert.Zero(t, body.Data[0].VendorID)
			assert.NotContains(t, body.Data[0].Description, "PrivateProvider")
			assert.NotContains(t, body.Data[0].Description, "https://")
		} else {
			require.Len(t, body.Vendors, 1)
			assert.Equal(t, "PrivateProvider", body.Vendors[0].Name)
			assert.Equal(t, 7, body.Data[0].VendorID)
			assert.Contains(t, body.Data[0].Description, "PrivateProvider")
		}
	}
}
