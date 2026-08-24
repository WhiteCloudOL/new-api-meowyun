package rinkoai

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/newapi"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/model_setting"

	"github.com/gin-gonic/gin"
)

// Adaptor keeps the normal New API forwarding behavior for all models and
// endpoints. NAI diffusion models are the one exception: Rinko exposes them
// through chat completions, so the image endpoint is converted to chat and
// the returned image data URI is converted back to OpenAI's image schema.
type Adaptor struct {
	newapi.Adaptor
}

var imageDataURIRegexp = regexp.MustCompile(`(?i)data:(image/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=_-]+)`)

type imageResponse struct {
	Data    []imageResponseData `json:"data"`
	Created int64               `json:"created"`
}

type imageResponseData struct {
	B64JSON       string `json:"b64_json,omitempty"`
	RevisedPrompt string `json:"revised_prompt,omitempty"`
}

func IsNAIModel(model string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(model)), "nai-")
}

func (a *Adaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {
	if isNAIImage(info) || isRinkoImageWithUnknownModel(info) {
		return relaycommon.GetFullRequestURL(info.ChannelBaseUrl, "/v1/chat/completions", info.ChannelType), nil
	}
	return a.Adaptor.GetRequestURL(info)
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error {
	if err := a.Adaptor.SetupRequestHeader(c, req, info); err != nil {
		return err
	}
	if isNAIImage(info) {
		// The downstream image edit may be multipart, but the adapter has
		// converted it to a JSON chat-completion request for Rinko.
		req.Set("Content-Type", "application/json")
	}
	return nil
}

func (a *Adaptor) ConvertImageRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (any, error) {
	model := resolveImageModel(c, info, request)
	if !IsNAIModel(model) && !isNAIModelFromInfo(info) {
		return a.Adaptor.ConvertImageRequest(c, info, request)
	}
	request.Model = model
	if info != nil {
		if info.OriginModelName == "" {
			info.OriginModelName = model
		}
		if info.ChannelMeta != nil && info.UpstreamModelName == "" {
			info.UpstreamModelName = model
		}
	}
	return convertNAIImageRequest(c, info, request)
}

func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error) {
	if !isNAIImage(info) {
		return a.Adaptor.DoRequest(c, info, requestBody)
	}

	// ImageHelper may intentionally preserve the original request body when
	// pass-through is enabled. Rebuild only in that case; otherwise keep the
	// already-converted body so channel parameter overrides are preserved.
	passThrough := model_setting.GetGlobalSettings().PassThroughRequestEnabled
	if info.ChannelMeta != nil {
		passThrough = passThrough || info.ChannelSetting.PassThroughBodyEnabled
	}
	if passThrough {
		imageRequest, ok := info.Request.(*dto.ImageRequest)
		if !ok {
			return nil, fmt.Errorf("invalid RinkoAI image request type: %T", info.Request)
		}
		converted, err := convertNAIImageRequest(c, info, *imageRequest)
		if err != nil {
			return nil, err
		}
		jsonData, err := common.Marshal(converted)
		if err != nil {
			return nil, fmt.Errorf("marshal RinkoAI image request: %w", err)
		}
		jsonData, err = relaycommon.ApplyParamOverrideWithRelayInfo(jsonData, info)
		if err != nil {
			return nil, fmt.Errorf("apply RinkoAI image parameter override: %w", err)
		}
		body, closer, err := relaycommon.NewOutboundJSONBody(jsonData)
		if err != nil {
			return nil, fmt.Errorf("create RinkoAI image request body: %w", err)
		}
		defer closer.Close()
		return channel.DoApiRequest(a, c, info, body)
	}

	// Use the outer adaptor so GetRequestURL above is used by DoApiRequest.
	return channel.DoApiRequest(a, c, info, requestBody)
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (usage any, err *types.NewAPIError) {
	if !isNAIImage(info) {
		return a.Adaptor.DoResponse(c, resp, info)
	}
	return handleNAIImageResponse(c, resp, info)
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return ChannelName
}

func isNAIImage(info *relaycommon.RelayInfo) bool {
	return info != nil &&
		(info.RelayMode == relayconstant.RelayModeImagesGenerations || info.RelayMode == relayconstant.RelayModeImagesEdits) &&
		(isNAIModelFromInfo(info) || isNAIModelFromRequest(info))
}

func isRinkoImageWithUnknownModel(info *relaycommon.RelayInfo) bool {
	return info != nil && info.ChannelType == constant.ChannelTypeRinkoAI &&
		(info.RelayMode == relayconstant.RelayModeImagesGenerations || info.RelayMode == relayconstant.RelayModeImagesEdits) &&
		!isNAIModelFromInfo(info) && !isNAIModelFromRequest(info)
}

func isNAIModelFromRequest(info *relaycommon.RelayInfo) bool {
	if info == nil || info.Request == nil {
		return false
	}
	request, ok := info.Request.(*dto.ImageRequest)
	return ok && IsNAIModel(request.Model)
}

func resolveImageModel(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) string {
	model := strings.TrimSpace(request.Model)
	if model == "" && c != nil && c.Request != nil {
		form := c.Request.MultipartForm
		if form == nil && strings.HasPrefix(c.Request.Header.Get("Content-Type"), "multipart/form-data") {
			if parsed, err := common.ParseMultipartFormReusable(c); err == nil {
				form = parsed
				c.Request.MultipartForm = parsed
				c.Request.PostForm = url.Values(parsed.Value)
			}
		}
		if form != nil && len(form.Value["model"]) > 0 {
			model = strings.TrimSpace(form.Value["model"][0])
		}
		if model == "" {
			model = strings.TrimSpace(c.Request.FormValue("model"))
		}
		if model == "" {
			model = strings.TrimSpace(c.Request.PostForm.Get("model"))
		}
	}
	if model == "" && c != nil {
		for _, candidate := range []string{
			c.GetString("model"),
			common.GetContextKeyString(c, constant.ContextKeyOriginalModel),
		} {
			if candidate = strings.TrimSpace(candidate); candidate != "" {
				model = candidate
				break
			}
		}
	}
	if model == "" && info != nil {
		model = strings.TrimSpace(info.UpstreamModelName)
	}
	if model == "" && info != nil {
		model = strings.TrimSpace(info.OriginModelName)
	}
	return model
}

func isNAIModelFromInfo(info *relaycommon.RelayInfo) bool {
	if info == nil {
		return false
	}
	return IsNAIModel(info.UpstreamModelName) || IsNAIModel(info.OriginModelName)
}

func convertNAIImageRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (any, error) {
	model := strings.TrimSpace(request.Model)
	if model == "" && info != nil {
		model = strings.TrimSpace(info.UpstreamModelName)
	}
	if model == "" && info != nil {
		model = strings.TrimSpace(info.OriginModelName)
	}
	if model == "" {
		return nil, fmt.Errorf("model is required for RinkoAI image requests")
	}

	content := any(request.Prompt)
	if info != nil && info.RelayMode == relayconstant.RelayModeImagesEdits {
		imageData, err := getInputImageDataURI(c, request)
		if err != nil {
			return nil, newNAIImageInputError(err)
		}
		if imageData == "" {
			return nil, newNAIImageInputError(fmt.Errorf("image is required for RinkoAI image edits"))
		}
		content = []dto.MediaContent{
			{Type: "text", Text: request.Prompt},
			{Type: "image_url", ImageUrl: map[string]string{"url": imageData}},
		}
	}

	stream := false
	return &dto.GeneralOpenAIRequest{
		Model: model,
		Messages: []dto.Message{{
			Role:    "user",
			Content: content,
		}},
		// Rinko's NAI endpoint returns one complete image. The downstream
		// image stream is generated from this complete response when requested.
		Stream: &stream,
	}, nil
}

func newNAIImageInputError(err error) error {
	return types.NewErrorWithStatusCode(err, types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
}

func getInputImageDataURI(c *gin.Context, request dto.ImageRequest) (string, error) {
	for _, raw := range []json.RawMessage{request.Image, request.Images} {
		if len(bytes.TrimSpace(raw)) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			continue
		}
		imageData, err := parseImageInput(raw)
		if err != nil {
			return "", err
		}
		if imageData != "" {
			return imageData, nil
		}
	}
	if c == nil || c.Request == nil {
		return "", nil
	}

	form := c.Request.MultipartForm
	if form == nil {
		var err error
		form, err = common.ParseMultipartFormReusable(c)
		if err != nil {
			return "", fmt.Errorf("failed to parse image edit form: %w", err)
		}
		c.Request.MultipartForm = form
	}

	files := form.File["image"]
	if len(files) == 0 {
		files = form.File["image[]"]
	}
	if len(files) == 0 {
		return "", nil
	}

	file, err := files[0].Open()
	if err != nil {
		return "", fmt.Errorf("failed to open input image: %w", err)
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return "", fmt.Errorf("failed to read input image: %w", err)
	}
	contentType := files[0].Header.Get("Content-Type")
	if contentType == "" {
		contentType = mime.TypeByExtension(filepath.Ext(files[0].Filename))
	}
	if !strings.HasPrefix(contentType, "image/") {
		contentType = "image/png"
	}
	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func parseImageInput(raw json.RawMessage) (string, error) {
	var value any
	if err := common.Unmarshal(raw, &value); err != nil {
		return "", fmt.Errorf("invalid image input: %w", err)
	}
	return findImageInput(value)
}

func findImageInput(value any) (string, error) {
	switch typed := value.(type) {
	case string:
		return normalizeImageInput(typed)
	case []any:
		for _, item := range typed {
			imageData, err := findImageInput(item)
			if err != nil {
				return "", err
			}
			if imageData != "" {
				return imageData, nil
			}
		}
	case map[string]any:
		for _, key := range []string{"image_url", "url", "image", "data"} {
			if nested, ok := typed[key]; ok {
				imageData, err := findImageInput(nested)
				if err != nil {
					return "", err
				}
				if imageData != "" {
					return imageData, nil
				}
			}
		}
	}
	return "", nil
}

func normalizeImageInput(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") {
		return value, nil
	}
	if strings.HasPrefix(strings.ToLower(value), "data:") {
		match := imageDataURIRegexp.FindStringSubmatch(value)
		if len(match) != 3 {
			return "", fmt.Errorf("invalid image data URI")
		}
		decoded, err := decodeImageBase64(match[2])
		if err != nil {
			return "", fmt.Errorf("invalid image data URI: %w", err)
		}
		return "data:" + match[1] + ";base64," + base64.StdEncoding.EncodeToString(decoded), nil
	}
	decoded, err := decodeImageBase64(value)
	if err != nil {
		return "", fmt.Errorf("image input must be a data URI, base64 string, or HTTP(S) URL: %w", err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(decoded), nil
}

func handleNAIImageResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		return nil, types.NewOpenAIError(fmt.Errorf("empty RinkoAI response"), types.ErrorCodeBadResponse, http.StatusBadGateway)
	}

	body, readErr := io.ReadAll(resp.Body)
	service.CloseResponseBodyGracefully(resp)
	if readErr != nil {
		return nil, types.NewOpenAIError(readErr, types.ErrorCodeReadResponseBodyFailed, http.StatusBadGateway)
	}

	var upstream dto.OpenAITextResponse
	if err := common.Unmarshal(body, &upstream); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	if upstreamError := upstream.GetOpenAIError(); upstreamError != nil && upstreamError.Type != "" {
		return nil, types.WithOpenAIError(*upstreamError, resp.StatusCode)
	}
	if len(upstream.Choices) == 0 {
		return nil, types.NewOpenAIError(fmt.Errorf("RinkoAI response has no choices"), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}

	// Search the complete JSON response so both string content (including
	// Markdown) and multimodal content arrays are accepted.
	match := imageDataURIRegexp.FindStringSubmatch(string(body))
	if len(match) != 3 {
		return nil, types.NewOpenAIError(fmt.Errorf("RinkoAI response does not contain a base64 image data URI"), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	decoded, err := decodeImageBase64(match[2])
	if err != nil {
		return nil, types.NewOpenAIError(fmt.Errorf("invalid RinkoAI image data: %w", err), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}

	imageBody, err := common.Marshal(imageResponse{
		Data:    []imageResponseData{{B64JSON: base64.StdEncoding.EncodeToString(decoded)}},
		Created: time.Now().Unix(),
	})
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	// The upstream chat call produced one image, regardless of a requested n.
	// Keep billing aligned with the number actually returned to the client.
	if info != nil {
		info.PriceData.AddOtherRatio("n", 1)
	}

	resp.StatusCode = http.StatusOK
	if resp.Header == nil {
		resp.Header = make(http.Header)
	}
	resp.Header.Set("Content-Type", "application/json")
	resp.Body = io.NopCloser(bytes.NewReader(imageBody))
	if info != nil && info.IsStream {
		return openai.OpenaiImageStreamHandler(c, info, resp)
	}
	service.IOCopyBytesGracefully(c, resp, imageBody)
	return &upstream.Usage, nil
}

func decodeImageBase64(value string) ([]byte, error) {
	for _, encoding := range []*base64.Encoding{
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
		base64.RawURLEncoding,
	} {
		if decoded, err := encoding.DecodeString(value); err == nil {
			return decoded, nil
		}
	}
	return nil, fmt.Errorf("unsupported base64 encoding")
}
