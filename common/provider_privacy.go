package common

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strings"
)

const UpstreamFailureMessage = "The upstream service could not complete the request"

var providerLinkPattern = regexp.MustCompile(`(?i)(?:https?|wss?)://[^\s<>"']+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|ai|cn|top|dev|app|cloud|co|pro)\b(?::\d+)?`)
var pluginErrorIdentityPattern = regexp.MustCompile(`plugin [a-zA-Z0-9_.-]+@[a-zA-Z0-9_.+-]+ hook [a-zA-Z0-9_.]+ failed: ?`)

// RedactProviderText is for diagnostic and catalog metadata, never generated
// model content, citations or downloadable artifacts.
func RedactProviderText(text string, identities ...string) string {
	text = providerLinkPattern.ReplaceAllString(text, "[redacted]")
	text = pluginErrorIdentityPattern.ReplaceAllString(text, "")
	patterns := make([]string, 0, len(identities))
	for _, identity := range identities {
		identity = strings.TrimSpace(identity)
		if identity == "" {
			continue
		}
		patterns = append(patterns, regexp.QuoteMeta(identity))
	}
	if len(patterns) > 0 {
		text = regexp.MustCompile(`(?i)(?:`+strings.Join(patterns, "|")+`)`).ReplaceAllString(text, "[provider]")
	}
	return text
}

// RedactProviderMetadata preserves model content, citations, artifact URLs and
// usage numbers. Only provider-identifying envelope metadata is projected out.
func RedactProviderMetadata(data []byte) []byte {
	var envelope map[string]json.RawMessage
	if Unmarshal(data, &envelope) != nil || envelope == nil {
		return data
	}
	changed := false
	for _, key := range []string{"provider", "provider_name", "provider_url", "provider_website", "website", "upstream_provider", "upstream_url", "api_base", "system_fingerprint"} {
		if _, exists := envelope[key]; exists {
			delete(envelope, key)
			changed = true
		}
	}
	if value, exists := envelope["response"]; exists {
		redacted := RedactProviderMetadata(value)
		if !bytes.Equal(value, redacted) {
			envelope["response"] = redacted
			changed = true
		}
	}
	if !changed {
		return data
	}
	encoded, err := Marshal(envelope)
	if err != nil {
		return data
	}
	return encoded
}
