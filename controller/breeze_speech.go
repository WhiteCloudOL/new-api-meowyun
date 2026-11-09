package controller

import (
	"context"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

var breezeVoiceID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// BreezeSpeechMetadata serves the upstream's shared voice library. Like the
// upstream API, access is governed by the API key and model permission.
func BreezeSpeechMetadata(c *gin.Context) {
	base := strings.TrimRight(common.GetContextKeyString(c, constant.ContextKeyChannelBaseUrl), "/")
	key := common.GetContextKeyString(c, constant.ContextKeyChannelKey)
	if c.GetString("task_plugin_key") != relaycommon.BreezePluginKey || base == "" || key == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "BreezeTTS channel is unavailable"})
		return
	}
	path := c.FullPath()
	if strings.Contains(path, ":voice_id") {
		id := c.Param("voice_id")
		if !breezeVoiceID.MatchString(id) {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "Invalid voice ID"})
			return
		}
		path = strings.Replace(path, ":voice_id", id, 1)
	}
	target := strings.TrimSuffix(base, "/v1") + path
	fail := func() {
		c.JSON(http.StatusBadGateway, gin.H{"detail": "BreezeTTS metadata request failed"})
	}
	if err := pluginruntime.ValidateRequestURL(target, base, nil); err != nil {
		fail()
		return
	}
	var bodyReader io.ReadCloser
	if c.Request.Method == http.MethodPost || c.Request.Method == http.MethodPatch {
		limit := int64(64 << 10)
		if c.Request.Method == http.MethodPost {
			limit += relaycommon.BreezeMaxReferenceBytes
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		storage, err := common.GetBodyStorage(c)
		defer common.CleanupBodyStorage(c)
		if err != nil || storage.Size() > limit {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"detail": "Voice request exceeds size limit"})
			return
		}
		bodyReader, err = storage.NewReader()
		if err != nil {
			fail()
			return
		}
		defer bodyReader.Close()
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	var reader io.Reader
	if bodyReader != nil {
		reader = bodyReader
	}
	req, err := http.NewRequestWithContext(ctx, c.Request.Method, target, reader)
	if err != nil {
		fail()
		return
	}
	req.Header.Set("Authorization", "Bearer "+key)
	if bodyReader != nil {
		req.Header.Set("Content-Type", c.GetHeader("Content-Type"))
	}
	settings, _ := common.GetContextKeyType[dto.ChannelSettings](c, constant.ContextKeyChannelSetting)
	client, err := service.GetHttpClientWithProxySettings(settings.Proxy, settings)
	if err != nil {
		fail()
		return
	}
	noRedirect := *client
	noRedirect.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := noRedirect.Do(req)
	if err != nil {
		fail()
		return
	}
	defer service.CloseResponseBodyGracefully(resp)
	const limit = 1 << 20
	body, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	mediaType, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if err != nil || len(body) > limit || resp.StatusCode < 200 || resp.StatusCode >= 300 && resp.StatusCode < 400 || resp.StatusCode >= 500 || mediaType != "application/json" {
		fail()
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Data(resp.StatusCode, "application/json", body)
}
