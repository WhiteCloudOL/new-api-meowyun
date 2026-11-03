package controller

import (
	"context"
	"io"
	"net/http"
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

func BreezeSpeechMetadata(c *gin.Context) {
	base := strings.TrimRight(common.GetContextKeyString(c, constant.ContextKeyChannelBaseUrl), "/")
	key := common.GetContextKeyString(c, constant.ContextKeyChannelKey)
	if c.GetString("task_plugin_key") != relaycommon.BreezeSpeechModel || base == "" || key == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "BreezeTTS channel is unavailable"})
		return
	}
	target := strings.TrimSuffix(base, "/v1") + c.FullPath()
	fail := func() {
		c.JSON(http.StatusBadGateway, gin.H{"detail": "BreezeTTS metadata request failed"})
	}
	if err := pluginruntime.ValidateRequestURL(target, base, nil); err != nil {
		fail()
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		fail()
		return
	}
	req.Header.Set("Authorization", "Bearer "+key)
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
	const limit = 64 << 10
	body, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil || len(body) > limit || resp.StatusCode != http.StatusOK || !strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json") {
		fail()
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Data(http.StatusOK, "application/json", body)
}
