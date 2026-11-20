package common

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestPaginationNormalizesInvalidSizesAndBoundsOffsets(t *testing.T) {
	for _, query := range []string{"p=-1&size=-5", "p=0&page_size=0", "p=999999999999999999999&size=100", "p=9223372036854775807&page_size=100", "p=2&ps=20"} {
		t.Run(query, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("GET", "/?"+query, nil)
			page := GetPageQuery(c)
			assert.GreaterOrEqual(t, page.Page, 1)
			assert.GreaterOrEqual(t, page.PageSize, 1)
			assert.LessOrEqual(t, page.PageSize, 100)
			assert.GreaterOrEqual(t, page.GetStartIdx(), 0)
			assert.GreaterOrEqual(t, page.GetEndIdx(), page.GetStartIdx())
			assert.Equal(t, query != "p=-1&size=-5", page.IsValid())
			if query == "p=2&ps=20" {
				assert.Equal(t, 20, page.GetStartIdx())
			}
		})
	}
}
