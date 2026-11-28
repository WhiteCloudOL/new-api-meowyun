package controller

import (
	"net/http"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

const docsSectionsOption = "DocsSections"
const docsSectionPrefix = "DocsSection:"

type documentationSection struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	ParentID string `json:"parentId,omitempty"`
}

var documentationSlug = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
var defaultDocumentationSections = []string{
	"quick-start", "openai", "openai-responses", "openai-images", "openai-image-edits",
	"openai-speech", "openai-models", "openai-audio-input", "openai-videos",
	"anthropic", "gemini", "dashscope", "dashscope-async",
	"dashscope-speech", "breeze", "deepseek", "troubleshooting",
}

func validDocumentationSlug(id string) bool {
	return len(id) <= 64 && documentationSlug.MatchString(id)
}

// documentationIndex accepts a preordered or flat section list. Resolving each
// parent chain within three steps rejects cycles as well as overdeep trees.
func documentationIndex(raw string) (map[string]string, bool) {
	if raw == "" {
		index := make(map[string]string, len(defaultDocumentationSections))
		for _, id := range defaultDocumentationSections {
			index[id] = ""
		}
		return index, true
	}
	var sections []documentationSection
	if len(raw) > 64*1024 || common.UnmarshalJsonStr(raw, &sections) != nil || len(sections) == 0 || len(sections) > 64 {
		return nil, false
	}
	index := make(map[string]string, len(sections))
	for _, section := range sections {
		title := strings.TrimSpace(section.Title)
		if !validDocumentationSlug(section.ID) || (title == "" && !slices.Contains(defaultDocumentationSections, section.ID)) || utf8.RuneCountInString(title) > 96 {
			return nil, false
		}
		if _, exists := index[section.ID]; exists {
			return nil, false
		}
		index[section.ID] = section.ParentID
	}
	for _, parent := range index {
		for depth := 1; parent != ""; depth++ {
			next, found := index[parent]
			if !found || depth >= 3 {
				return nil, false
			}
			parent = next
		}
	}
	return index, true
}

func GetDocsSections(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[docsSectionsOption]
	common.OptionMapRWMutex.RUnlock()
	serveRevalidatedJSON(c, raw)
}

func GetDocs(c *gin.Context) {
	id := c.Param("section")
	common.OptionMapRWMutex.RLock()
	raw, markdown := common.OptionMap[docsSectionsOption], common.OptionMap[docsSectionPrefix+id]
	common.OptionMapRWMutex.RUnlock()
	index, valid := documentationIndex(raw)
	if _, exists := index[id]; !valid || !exists {
		c.Status(http.StatusNotFound)
		return
	}
	serveRevalidatedJSON(c, markdown)
}

func validateDocumentationOption(key, value string) bool {
	if key == docsSectionsOption {
		_, valid := documentationIndex(value)
		return valid
	}
	id, document := strings.CutPrefix(key, docsSectionPrefix)
	return !document || validDocumentationSlug(id) && len(value) <= 512*1024
}
