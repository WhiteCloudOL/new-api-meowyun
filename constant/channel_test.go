package constant

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetChannelBaseURLIsBoundsSafe(t *testing.T) {
	assert.Empty(t, GetChannelBaseURL(ChannelTypeTaskPlugin))
	assert.Equal(t, "https://api.rinko.ai", GetChannelBaseURL(ChannelTypeRinkoAI))
	assert.NotEqual(t, ChannelTypeTaskPlugin, ChannelTypeRinkoAI)
	assert.Empty(t, GetChannelBaseURL(9999))
}
