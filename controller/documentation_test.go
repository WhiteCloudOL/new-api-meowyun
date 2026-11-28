package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDocumentationSections(t *testing.T) {
	for _, tc := range []struct {
		name string
		raw  string
		want bool
	}{
		{"default", "", true},
		{"three levels", `[{"id":"one","title":"One"},{"id":"two","title":"Two","parentId":"one"},{"id":"three","title":"Three","parentId":"two"}]`, true},
		{"missing parent", `[{"id":"one","title":"One","parentId":"missing"}]`, false},
		{"duplicate", `[{"id":"one","title":"One"},{"id":"one","title":"Two"}]`, false},
		{"cycle", `[{"id":"one","title":"One","parentId":"two"},{"id":"two","title":"Two","parentId":"one"}]`, false},
		{"four levels", `[{"id":"one","title":"One"},{"id":"two","title":"Two","parentId":"one"},{"id":"three","title":"Three","parentId":"two"},{"id":"four","title":"Four","parentId":"three"}]`, false},
		{"stable safe slug", `[{"id":"../one","title":"One"}]`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, validateDocumentationOption(docsSectionsOption, tc.raw))
		})
	}
}

func TestDocsReadsOnlyTheSelectedPublishedSection(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{
		docsSectionsOption:             `[{"id":"openai","title":"OpenAI"},{"id":"edits","title":"Edits","parentId":"openai"}]`,
		docsSectionPrefix + "openai":   "Chat options",
		docsSectionPrefix + "edits":    "Edit options",
		docsSectionPrefix + "archived": "Archived options",
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})

	handler := gin.New()
	handler.GET("/api/docs/:section", GetDocs)
	edits := httptest.NewRecorder()
	handler.ServeHTTP(edits, httptest.NewRequest(http.MethodGet, "/api/docs/edits", nil))
	require.Equal(t, http.StatusOK, edits.Code)
	assert.JSONEq(t, `{"success":true,"message":"","data":"Edit options"}`, edits.Body.String())

	archived := httptest.NewRecorder()
	handler.ServeHTTP(archived, httptest.NewRequest(http.MethodGet, "/api/docs/archived", nil))
	assert.Equal(t, http.StatusNotFound, archived.Code)
}
