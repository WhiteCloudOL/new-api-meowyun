package router

import (
	"fmt"
	"sort"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestHostProtocolRegistryDrivesProtocolRoutesOnce(t *testing.T) {
	engine := gin.New()
	SetTaskPluginProtocolRouter(engine)

	expected := []string{
		"GET /api-ws/v1/inference",
		"GET /api-ws/v1/realtime",
		"GET /alibaba-tts/api-ws/v1/inference",
		"GET /alibaba-tts/api-ws/v1/realtime",
		"POST /v1/audio/speech",
		"GET /v1/voices",
		"POST /v1/voices",
		"GET /v1/voices/:voice_id",
		"PATCH /v1/voices/:voice_id",
		"DELETE /v1/voices/:voice_id",
		"GET /health",
		"GET /v1/model",
		"GET /v1/queue",
		"POST /v1/responses",
		"GET /v1/responses/:response_id",
		"POST /v1/videos",
		"GET /v1/videos/:task_id",
		"GET /v1/videos/:task_id/content",
		"HEAD /v1/videos/:task_id/content",
		"POST /v1/images/generations",
		"POST /v1/images/edits",
	}
	actual := make([]string, 0, len(engine.Routes()))
	for _, route := range engine.Routes() {
		actual = append(actual, fmt.Sprintf("%s %s", route.Method, route.Path))
	}
	sort.Strings(expected)
	sort.Strings(actual)
	assert.Equal(t, expected, actual)
}
