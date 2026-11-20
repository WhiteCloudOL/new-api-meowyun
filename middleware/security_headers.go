package middleware

import (
	"crypto/sha256"
	"encoding/base64"
	"net/url"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// SecurityHeaders covers successful, rejected and unknown routes. Inline
// bootstrap/analytics scripts are authorized by their build-time content,
// rather than permitting arbitrary inline scripts from configured HTML.
func SecurityHeaders(indexPage []byte) gin.HandlerFunc {
	scripts := []string{"'self'", "https://challenges.cloudflare.com"}
	scriptPattern := regexp.MustCompile(`(?is)<script\b([^>]*)>(.*?)</script>`)
	sourcePattern := regexp.MustCompile(`(?i)\bsrc=["']([^"']+)["']`)
	for _, script := range scriptPattern.FindAllSubmatch(indexPage, -1) {
		if len(strings.TrimSpace(string(script[2]))) > 0 {
			content := strings.ReplaceAll(string(script[2]), "\r\n", "\n")
			digest := sha256.Sum256([]byte(content))
			scripts = append(scripts, "'sha256-"+base64.StdEncoding.EncodeToString(digest[:])+"'")
		}
		if source := sourcePattern.FindSubmatch(script[1]); len(source) > 1 {
			if parsed, err := url.Parse(string(source[1])); err == nil && parsed.Scheme == "https" && parsed.Host != "" && parsed.User == nil {
				scripts = append(scripts, parsed.Scheme+"://"+parsed.Host)
			}
		}
	}
	policy := "default-src 'self'; script-src " + strings.Join(scripts, " ") +
		"; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:;" +
		" font-src 'self' data: https:; connect-src 'self' https: wss:;" +
		" media-src 'self' blob: data: https:; frame-src https:; worker-src 'self' blob:;" +
		" frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self' https:"
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("Permissions-Policy", "camera=(), microphone=(self), geolocation=()")
		// OAuth verification uses a cross-origin popup and must retain its opener.
		c.Header("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
		c.Header("Content-Security-Policy", policy)
		if common.SessionCookieSecure || c.Request.TLS != nil {
			c.Header("Strict-Transport-Security", "max-age=31536000")
		}
		c.Next()
	}
}
