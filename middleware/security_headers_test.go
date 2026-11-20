package middleware

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestSecurityHeadersCoverErrorsAndAuthorizeOnlyBuiltInScripts(t *testing.T) {
	previous := common.SessionCookieSecure
	common.SessionCookieSecure = true
	t.Cleanup(func() { common.SessionCookieSecure = previous })
	bootstrap := "window.theme='dark'"
	digest := sha256.Sum256([]byte(bootstrap))
	router := gin.New()
	router.Use(SecurityHeaders([]byte("<script>"+bootstrap+"</script>")), PanicRecover())
	router.GET("/ok", func(c *gin.Context) { c.Status(http.StatusOK) })
	router.GET("/denied", func(c *gin.Context) { c.AbortWithStatus(http.StatusUnauthorized) })
	router.GET("/panic", func(c *gin.Context) { panic("test failure") })
	for _, path := range []string{"/ok", "/denied", "/missing", "/panic"} {
		t.Run(path, func(t *testing.T) {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
			assert.Equal(t, "nosniff", response.Header().Get("X-Content-Type-Options"))
			assert.Equal(t, "DENY", response.Header().Get("X-Frame-Options"))
			assert.Equal(t, "no-referrer", response.Header().Get("Referrer-Policy"))
			assert.Equal(t, "max-age=31536000", response.Header().Get("Strict-Transport-Security"))
			policy := response.Header().Get("Content-Security-Policy")
			assert.Contains(t, policy, "'sha256-"+base64.StdEncoding.EncodeToString(digest[:])+"'")
			assert.Contains(t, policy, "frame-ancestors 'none'")
			scriptPolicy := strings.Split(strings.Split(policy, "script-src ")[1], ";")[0]
			assert.NotContains(t, scriptPolicy, "'unsafe-inline'")
			assert.NotContains(t, scriptPolicy, "'unsafe-eval'")
			assert.Contains(t, response.Header().Get("Permissions-Policy"), "microphone=(self)")
			assert.Equal(t, "same-origin-allow-popups", response.Header().Get("Cross-Origin-Opener-Policy"))
		})
	}
}

func TestCORSAllowsKeyClientsWithoutCredentialedManagementAccess(t *testing.T) {
	router := gin.New()
	router.Use(CORS())
	for _, path := range []string{"/api/user/self", "/api/log/token", "/dashboard/billing/usage", "/v1/models", "/v1/audio/speech"} {
		router.Any(path, func(c *gin.Context) { c.Status(http.StatusOK) })
		for _, method := range []string{http.MethodGet, http.MethodOptions} {
			t.Run(path+method, func(t *testing.T) {
				request := httptest.NewRequest(method, path, nil)
				request.Header.Set("Origin", "https://untrusted.example")
				request.Header.Set("Access-Control-Request-Method", "POST")
				request.Header.Set("Access-Control-Request-Headers", "Authorization, Content-Type")
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				assert.Empty(t, response.Header().Get("Access-Control-Allow-Credentials"))
				if strings.HasPrefix(path, "/v1/") {
					assert.Equal(t, "*", response.Header().Get("Access-Control-Allow-Origin"))
					if method == http.MethodOptions {
						assert.Contains(t, response.Header().Get("Access-Control-Allow-Headers"), "Authorization")
					}
				} else {
					assert.Empty(t, response.Header().Get("Access-Control-Allow-Origin"))
				}
			})
		}
	}
}
