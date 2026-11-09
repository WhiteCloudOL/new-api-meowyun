package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBreezeVoiceLibraryTransport(t *testing.T) {
	for _, tc := range []struct {
		name, method, path, body string
		status                   int
	}{
		{"list", "GET", "/v1/voices", "", 200},
		{"register", "POST", "/v1/voices", "reference upload", 200},
		{"metadata", "PATCH", "/v1/voices/narrator", `{"description":"calm"}`, 200},
		{"remove", "DELETE", "/v1/voices/narrator", "", 200},
		{"missing voice", "GET", "/v1/voices/narrator", "", 404},
		{"no redirect credentials", "GET", "/v1/voices", "", 302},
		{"invalid ID", "GET", "/v1/voices/..", "", 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				assert.Equal(t, tc.method, r.Method)
				assert.Equal(t, tc.path, r.URL.Path)
				assert.Equal(t, "Bearer provider-test-key", r.Header.Get("Authorization"))
				assert.Empty(t, r.Header.Get("Cookie"))
				body, err := io.ReadAll(r.Body)
				require.NoError(t, err)
				assert.Equal(t, tc.body, string(body))
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Location", "https://untrusted.example/steal")
				w.WriteHeader(tc.status)
				_, err = w.Write([]byte(`{"id":"narrator"}`))
				require.NoError(t, err)
			}))
			defer upstream.Close()
			engine := gin.New()
			path := "/v1/voices"
			if strings.HasSuffix(tc.path, "/narrator") || strings.HasSuffix(tc.path, "/..") {
				path += "/:voice_id"
			}
			engine.Handle(tc.method, path, func(c *gin.Context) {
				common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, upstream.URL+"/v1")
				common.SetContextKey(c, constant.ContextKeyChannelKey, "provider-test-key")
				c.Set("task_plugin_key", relaycommon.BreezePluginKey)
			}, BreezeSpeechMetadata)
			request := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			request.Header.Set("Authorization", "Bearer gateway-test-key")
			request.Header.Set("Cookie", "session=private")
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, request)
			if tc.status == 302 {
				assert.Equal(t, 502, recorder.Code)
			} else {
				assert.Equal(t, tc.status, recorder.Code)
			}
			if tc.name == "invalid ID" {
				assert.Zero(t, calls)
			} else {
				assert.Equal(t, 1, calls)
			}
			assert.Empty(t, recorder.Header().Get("Location"))
		})
	}
}
