package openai

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpstreamCharacterCount(t *testing.T) {
	resp := &http.Response{Header: http.Header{}}
	resp.Header.Set(newAPIUsageCharactersHeader, "29")

	count, ok, err := upstreamCharacterCount(resp)

	require.NoError(t, err)
	assert.True(t, ok)
	assert.Equal(t, 29, count)
	assert.Empty(t, resp.Header.Get(newAPIUsageCharactersHeader), "internal usage header must not reach clients")
}

func TestUpstreamCharacterCountDoesNotAffectNormalOpenAITTS(t *testing.T) {
	resp := &http.Response{Header: http.Header{}}

	count, ok, err := upstreamCharacterCount(resp)

	require.NoError(t, err)
	assert.False(t, ok)
	assert.Zero(t, count)
}

func TestUpstreamCharacterCountRejectsInvalidValue(t *testing.T) {
	resp := &http.Response{Header: http.Header{}}
	resp.Header.Set(newAPIUsageCharactersHeader, "not-a-number")

	_, ok, err := upstreamCharacterCount(resp)

	require.Error(t, err)
	assert.False(t, ok)
	assert.Empty(t, resp.Header.Get(newAPIUsageCharactersHeader), "invalid internal usage header must not reach clients")
}

func TestOpenaiTTSHandlerUsesUpstreamCharacterCount(t *testing.T) {
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/audio/speech", nil)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{},
		Body:       io.NopCloser(strings.NewReader("audio")),
	}
	resp.Header.Set(newAPIUsageCharactersHeader, "29")

	usage := OpenaiTTSHandler(ctx, resp, &relaycommon.RelayInfo{})

	require.NotNil(t, usage)
	assert.Equal(t, 29, usage.PromptTokens)
	assert.Equal(t, 29, usage.PromptTokensDetails.TextTokens)
	assert.Zero(t, usage.CompletionTokens)
	assert.Zero(t, usage.CompletionTokenDetails.AudioTokens)
	assert.Equal(t, 29, usage.TotalTokens)
	assert.Equal(t, "characters", ctx.GetString("billing_unit"))
	assert.Equal(t, 29, ctx.GetInt("billing_characters"))
	assert.Empty(t, recorder.Header().Get(newAPIUsageCharactersHeader))
	assert.Equal(t, "audio", recorder.Body.String())
}

func TestOpenaiTTSHandlerKeepsStandardDurationBillingWithoutHeader(t *testing.T) {
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/audio/speech", nil)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{},
		Body:       io.NopCloser(bytes.NewReader(make([]byte, 48_000))),
	}
	info := &relaycommon.RelayInfo{
		Request: &dto.AudioRequest{ResponseFormat: "pcm"},
	}
	info.SetEstimatePromptTokens(7)

	usage := OpenaiTTSHandler(ctx, resp, info)

	require.NotNil(t, usage)
	assert.Equal(t, 7, usage.PromptTokens)
	assert.Equal(t, 17, usage.CompletionTokens)
	assert.Equal(t, 17, usage.CompletionTokenDetails.AudioTokens)
	assert.Equal(t, 24, usage.TotalTokens)
	assert.Empty(t, ctx.GetString("billing_unit"))
}
