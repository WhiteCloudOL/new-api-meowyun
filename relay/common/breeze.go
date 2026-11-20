package common

import (
	"net/url"
	"strconv"
	"strings"

	appcommon "github.com/QuantumNous/new-api/common"
)

// BreezeScopedURL addresses the private upstream API with an opaque namespace
// derived from the authenticated user, stable across relay keys and channels.
func BreezeScopedURL(base string, userID int, path string) string {
	if userID <= 0 || appcommon.CryptoSecret == "" {
		return ""
	}
	target, err := url.Parse(base)
	if err != nil || target.Host == "" || target.Scheme != "http" && target.Scheme != "https" ||
		target.User != nil || target.ForceQuery || target.RawQuery != "" || target.Fragment != "" {
		return ""
	}
	scope := appcommon.GenerateHMAC("breeze-tts-voice-v1:" + strconv.Itoa(userID))
	target.Path = strings.TrimSuffix(strings.TrimRight(target.Path, "/"), "/v1") + "/new-api/" + scope + path
	target.RawPath = ""
	return target.String()
}
