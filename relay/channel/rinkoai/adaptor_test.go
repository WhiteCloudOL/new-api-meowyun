package rinkoai

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsNAIModel(t *testing.T) {
	assert.True(t, IsNAIModel("nai-diffusion-5-full"))
	assert.True(t, IsNAIModel("NAI-diffusion-5-curated"))
	assert.False(t, IsNAIModel("gpt-image-2"))
	assert.False(t, IsNAIModel("nai"))
}

func TestConvertNAIImageRequestUsesChatCompletionShape(t *testing.T) {
	stream := true
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeImagesGenerations,
		OriginModelName: "nai-diffusion-5-full",
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "nai-diffusion-5-full",
		},
	}
	request := dto.ImageRequest{
		Model:  "nai-diffusion-5-full",
		Prompt: "a small red fox",
		Stream: &stream,
	}

	converted, err := convertNAIImageRequest(nil, info, request)
	require.NoError(t, err)
	chatRequest, ok := converted.(*dto.GeneralOpenAIRequest)
	require.True(t, ok)
	require.Len(t, chatRequest.Messages, 1)
	assert.Equal(t, "user", chatRequest.Messages[0].Role)
	assert.Equal(t, "a small red fox", chatRequest.Messages[0].StringContent())
	require.NotNil(t, chatRequest.Stream)
	assert.False(t, *chatRequest.Stream)

	body, err := common.Marshal(chatRequest)
	require.NoError(t, err)
	assert.JSONEq(t, `{"model":"nai-diffusion-5-full","messages":[{"role":"user","content":"a small red fox"}],"stream":false}`, string(body))
}

func TestConvertNAIImageEditMultipartUsesFallbackModelAndImage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.WriteField("prompt", "edit this image"))
	part, err := writer.CreateFormFile("image", "input.png")
	require.NoError(t, err)
	_, err = part.Write([]byte("fake image"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", &body)
	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeImagesEdits,
		OriginModelName: "nai-diffusion-5-full",
		ChannelMeta:     &relaycommon.ChannelMeta{},
	}

	converted, err := convertNAIImageRequest(c, info, dto.ImageRequest{Prompt: "edit this image"})
	require.NoError(t, err)
	chatRequest, ok := converted.(*dto.GeneralOpenAIRequest)
	require.True(t, ok)
	assert.Equal(t, "nai-diffusion-5-full", chatRequest.Model)

	encoded, err := common.Marshal(chatRequest)
	require.NoError(t, err)
	assert.Contains(t, string(encoded), `"type":"image_url"`)
	assert.Contains(t, string(encoded), `data:image/png;base64,ZmFrZSBpbWFnZQ==`)
}

func TestConvertNAIImageEditAcceptsBase64JSONInput(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeImagesEdits,
		OriginModelName: "nai-diffusion-5-full",
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "nai-diffusion-5-full",
		},
	}
	request := dto.ImageRequest{
		Prompt: "edit this image",
		Image:  json.RawMessage(`"ZmFrZSBpbWFnZQ=="`),
	}

	converted, err := convertNAIImageRequest(nil, info, request)
	require.NoError(t, err)
	chatRequest, ok := converted.(*dto.GeneralOpenAIRequest)
	require.True(t, ok)
	encoded, err := common.Marshal(chatRequest)
	require.NoError(t, err)
	assert.Contains(t, string(encoded), `data:image/png;base64,ZmFrZSBpbWFnZQ==`)
}

func TestDoRequestRebuildsNAIImageBodyFromOriginalRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var gotBody []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"data:image/png;base64,iVBORw0KGgo="}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`))
	}))
	defer server.Close()

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", bytes.NewBufferString("original multipart body"))
	c.Request.Header.Set("Content-Type", "multipart/form-data; boundary=test")
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeImagesEdits,
		OriginModelName: "nai-diffusion-5-full",
		Request: &dto.ImageRequest{
			Model:  "nai-diffusion-5-full",
			Prompt: "edit this image",
			Image:  json.RawMessage(`"ZmFrZSBpbWFnZQ=="`),
		},
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       constant.ChannelTypeRinkoAI,
			ChannelBaseUrl:    server.URL,
			ApiKey:            "test-key",
			UpstreamModelName: "nai-diffusion-5-full",
		},
	}

	_, err := (&Adaptor{}).DoRequest(c, info, bytes.NewBufferString("wrong body"))
	require.NoError(t, err)
	var body dto.GeneralOpenAIRequest
	require.NoError(t, common.Unmarshal(gotBody, &body))
	assert.Equal(t, "nai-diffusion-5-full", body.Model)
	assert.Equal(t, "edit this image", body.Messages[0].StringContent())
}

func TestGetRequestURLKeepsNormalNewAPIForwarding(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeChatCompletions,
		RequestURLPath:  "/v1/chat/completions",
		OriginModelName: "gpt-4o-mini",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl:    "https://upstream.example",
			ChannelType:       constant.ChannelTypeRinkoAI,
			UpstreamModelName: "gpt-4o-mini",
		},
	}

	url, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://upstream.example/v1/chat/completions", url)
}

func TestHandleNAIImageResponseReturnsOpenAIImageResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeImagesGenerations,
		OriginModelName: "nai-diffusion-5-full",
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "nai-diffusion-5-full",
		},
	}
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewBufferString(`{"id":"chatcmpl-test","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":"![image](data:image/png;base64,iVBORw0KGgo=)"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}`)),
	}

	usage, apiErr := handleNAIImageResponse(c, resp, info)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	assert.Equal(t, 3, usage.TotalTokens)
	assert.Equal(t, 200, recorder.Code)
	assert.Equal(t, "application/json", recorder.Header().Get("Content-Type"))

	var got imageResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &got))
	require.Len(t, got.Data, 1)
	assert.Equal(t, "iVBORw0KGgo=", got.Data[0].B64JSON)
	assert.NotZero(t, got.Created)
}
