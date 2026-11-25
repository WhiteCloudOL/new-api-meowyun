package plugins

import (
	"embed"
	"fmt"
	"io/fs"
	"strings"

	"github.com/MoeForge/moego/base64"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
)

//go:embed tasks
var taskPlugins embed.FS

func init() {
	entries, err := fs.ReadDir(taskPlugins, "tasks")
	if err != nil {
		panic(fmt.Sprintf("read embedded task plugins: %v", err))
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		key := entry.Name()
		source, sourceErr := Source(key)
		if sourceErr != nil {
			panic(fmt.Sprintf("read embedded task plugin %s: %v", key, sourceErr))
		}
		if _, registerErr := jsplugin.DefaultRegistry.RegisterFactory(source, jsplugin.Options{Key: key}); registerErr != nil {
			panic(fmt.Sprintf("register embedded task plugin %s: %v", key, registerErr))
		}
		if mediaType, data, ok := Icon(key); ok {
			if iconErr := jsplugin.ValidateIconImage(mediaType, data); iconErr != nil {
				panic(fmt.Sprintf("embedded task plugin %s icon: %v", key, iconErr))
			}
		}
	}
}

// Source returns the embedded factory source for a task plugin key.
func Source(key string) (string, error) {
	source, err := taskPlugins.ReadFile("tasks/" + key + "/plugin.js")
	if err != nil {
		return "", err
	}
	if key == "alibaba" {
		speech, err := taskPlugins.ReadFile("tasks/alibaba-tts/plugin.js")
		if err != nil {
			return "", err
		}
		// Keep the existing speech-only factory key for saved channels and
		// pricing overrides. Both entries execute the same speech driver.
		return string(source) + "\nconst bailianSpeech = (() => {\n" +
			strings.ReplaceAll(string(speech), "export const ", "const ") + alibabaSpeechBindings, nil
	}
	return string(source), nil
}

const alibabaSpeechBindings = `
  return {meta, protocols, native};
})();
const speechMeta = bailianSpeech.meta;
const speechProfiles = speechMeta.usageProfiles;
const ordinarySpeechModels = speechMeta.models.filter(
  model => !speechProfiles.some(profile => profile.models.includes(model))
);
// Responses and native video previously had no explicit model scope.
// Keep that scope tied to the original image and video models.
for (const protocol of meta.protocols) {
  if (protocol.models === undefined) protocol.models = meta.models.slice();
}
for (const route of meta.routes) {
  if (route.type === "submit" && route.models === undefined) {
    route.models = meta.models.filter(model => !imageModel({model}));
  }
}
meta.models = meta.models.concat(speechMeta.models);
meta.protocols = meta.protocols.concat(speechMeta.protocols);
meta.routes = meta.routes.concat(speechMeta.routes);
meta.usageProfiles = meta.usageProfiles.concat(speechProfiles, [{models: ordinarySpeechModels, schema: {}}]);
meta.channelConfig = speechMeta.channelConfig;
meta.allowedHosts = speechMeta.allowedHosts;
meta.baseUrl = speechMeta.baseUrl;
Object.assign(native, bailianSpeech.native);
Object.assign(protocols, bailianSpeech.protocols);
`

// Icon returns the embedded sidecar logo for a factory plugin, if the plugin
// directory ships an icon.svg or icon.png next to plugin.js.
func Icon(key string) (mediaType string, data []byte, ok bool) {
	if data, err := taskPlugins.ReadFile("tasks/" + key + "/icon.svg"); err == nil {
		return "image/svg+xml", data, true
	}
	if data, err := taskPlugins.ReadFile("tasks/" + key + "/icon.png"); err == nil {
		return "image/png", data, true
	}
	return "", nil, false
}

// IconDataURI returns the embedded factory logo in the same data URI form the
// task_plugins.icon column stores, so factory and override logos share one
// read path.
func IconDataURI(key string) string {
	mediaType, data, ok := Icon(key)
	if !ok {
		return ""
	}
	return base64.EncodeDataURL(mediaType, data)
}
