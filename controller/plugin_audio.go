package controller

import (
	"github.com/QuantumNous/new-api/relay"
	"github.com/gin-gonic/gin"
)

func PluginSpeechWebSocket(c *gin.Context) {
	runner := newResponsesWSRequestRunner(c)
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer ws.Close()
	relay.PluginSpeechWebSocketHelper(c, ws, runner)
}
