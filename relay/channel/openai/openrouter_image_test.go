package openai

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func newOpenRouterImageTestInfo(mode int) *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{
		RelayMode: mode,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:    constant.ChannelTypeOpenRouter,
			ChannelBaseUrl: "https://openrouter.ai/api",
		},
	}
}

func TestOpenRouterImageURL(t *testing.T) {
	info := newOpenRouterImageTestInfo(relayconstant.RelayModeImagesEdits)
	url, err := (&Adaptor{}).GetRequestURL(info)
	require.NoError(t, err)
	require.Equal(t, "https://openrouter.ai/api/v1/images", url)
}

func TestConvertOpenRouterMultipartImageEdit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.WriteField("model", "openai/gpt-image-2"))
	require.NoError(t, writer.WriteField("prompt", "turn this into a watercolor"))
	part, err := writer.CreateFormFile("image", "reference.png")
	require.NoError(t, err)
	_, err = part.Write([]byte("fake png"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", &body)
	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	request := dto.ImageRequest{Model: "openai/gpt-image-2", Prompt: "turn this into a watercolor"}

	converted, err := (&Adaptor{}).ConvertImageRequest(c, newOpenRouterImageTestInfo(relayconstant.RelayModeImagesEdits), request)
	require.NoError(t, err)
	payload, ok := converted.(map[string]json.RawMessage)
	require.True(t, ok)
	require.Equal(t, `"openai/gpt-image-2"`, string(payload["model"]))

	var references []struct {
		Type     string `json:"type"`
		ImageURL struct {
			URL string `json:"url"`
		} `json:"image_url"`
	}
	require.NoError(t, json.Unmarshal(payload["input_references"], &references))
	require.Len(t, references, 1)
	require.Equal(t, "image_url", references[0].Type)
	require.True(t, strings.HasPrefix(references[0].ImageURL.URL, "data:image/png;base64,"))
	require.Equal(t, "application/json", c.Request.Header.Get("Content-Type"))
}
