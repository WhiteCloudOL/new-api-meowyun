package middleware

import (
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

// NormalizeBreezeSpeech converts native form requests into the same model and
// input used by the speech relay, token allowlist and prepaid billing.
func NormalizeBreezeSpeech(c *gin.Context) {
	const model = relaycommon.BreezeSpeechModel
	if _, ok := pluginruntime.DefaultRegistry.Generation().Get(relaycommon.BreezePluginKey); !ok {
		c.Next()
		return
	}
	media, _, _ := mime.ParseMediaType(c.GetHeader("Content-Type"))
	form := media == "multipart/form-data" || media == "application/x-www-form-urlencoded"

	jsonBody := media == "application/json" || strings.HasSuffix(media, "+json")
	if !form && !jsonBody {
		c.Next()
		return
	}

	normalize := func() error {
		storage, err := common.GetBodyStorage(c)
		if err != nil {
			return err
		}
		body := make(map[string]any)
		if form {
			var fields url.Values
			if media == "multipart/form-data" {
				parts, err := common.ParseMultipartFormReusable(c)
				if err != nil {
					return fmt.Errorf("invalid speech multipart form")
				}
				defer parts.RemoveAll()
				fields = parts.Value
				if files := parts.File["ref_audio"]; len(files) > 0 {
					if len(files) != 1 || files[0].Size > relaycommon.BreezeMaxReferenceBytes {
						return fmt.Errorf("provide one reference audio file of at most 10 MiB")
					}
					file, err := files[0].Open()
					if err != nil {
						return fmt.Errorf("cannot read reference audio")
					}
					defer file.Close()
					audio, err := io.ReadAll(io.LimitReader(file, relaycommon.BreezeMaxReferenceBytes+1))
					if err != nil || len(audio) == 0 || len(audio) > relaycommon.BreezeMaxReferenceBytes {
						return fmt.Errorf("invalid reference audio")
					}
					body["ref_audio"] = base64.StdEncoding.EncodeToString(audio)
					body["ref_audio_filename"] = files[0].Filename
				}
			} else {
				raw, err := storage.Bytes()
				if err != nil {
					return err
				}
				fields, err = url.ParseQuery(string(raw))
				if err != nil {
					return fmt.Errorf("invalid speech form")
				}
			}
			for _, key := range []string{"model", "text", "instruction", "voice_id", "cfg_scale", "ref_text", "seed", "max_new_tokens", "temperature", "top_k", "top_p", "repetition_penalty", "split_chars"} {
				values := fields[key]
				if len(values) > 1 {
					return fmt.Errorf("speech field %q must appear only once", key)
				}
				if len(values) == 1 {
					body[key] = values[0]
				}
			}
			body["response_format"] = "pcm"
			body["breeze_native_pcm"] = true
		} else {
			raw, err := storage.Bytes()
			if err != nil {
				return err
			}
			if err := common.Unmarshal(raw, &body); err != nil || body == nil {
				return fmt.Errorf("invalid speech JSON object")
			}
		}
		if !form {
			// Only this model accepts the vendor's object-shaped voice field.
			// Normalize it before the host's string-shaped speech DTO is parsed.
			if name, _ := body["model"].(string); strings.EqualFold(name, model) && body["input"] != nil {
				voice, object := body["voice"].(map[string]any)
				if !object {
					return nil
				}
				id, ok := voice["id"].(string)
				if !ok {
					return fmt.Errorf("voice id must be a string")
				}
				body["voice"] = id
			} else {
				// A native text field identifies Breeze; explicitly different models
				// stay on their own routing path.
				text, native := body["text"].(string)
				name, _ := body["model"].(string)
				if !native || body["input"] != nil || name != "" && !strings.EqualFold(name, model) {
					return nil
				}
				body["input"] = text
				body["response_format"] = "pcm"
				body["breeze_native_pcm"] = true
			}
		}
		name, modelIsString := body["model"].(string)
		if body["model"] != nil && !modelIsString {
			return fmt.Errorf("model must be a string")
		}
		if name != "" && !strings.EqualFold(name, model) {
			return fmt.Errorf("native BreezeTTS synthesis requires model %s", model)
		}
		body["model"] = model
		if body["input"] == nil {
			body["input"] = body["text"]
		}
		encoded, err := common.Marshal(body)
		if err != nil {
			return err
		}
		next, err := common.CreateBodyStorage(encoded)
		if err != nil {
			return err
		}
		_ = storage.Close()
		c.Set(common.KeyBodyStorage, next)
		c.Set(common.KeyRequestBody, nil)
		c.Request.Body = io.NopCloser(next)
		c.Request.ContentLength = int64(len(encoded))
		c.Request.Header.Set("Content-Type", "application/json")
		return nil
	}
	if err := normalize(); err != nil {
		abortWithOpenAiMessage(c, invalidRequestStatus(err), err.Error())
		return
	}
	c.Next()
}

// SelectBreezeMetadataModel sends the fixed native metadata routes through the
// regular model allowlist and channel selector.
func SelectBreezeMetadataModel(c *gin.Context) {
	const model = relaycommon.BreezeSpeechModel
	if _, ok := pluginruntime.DefaultRegistry.Generation().Get(relaycommon.BreezePluginKey); !ok {
		abortWithOpenAiMessage(c, http.StatusNotFound, "BreezeTTS is unavailable")
		return
	}
	c.Set("resolved_task_model", model)
	c.Set("expected_task_plugin_key", relaycommon.BreezePluginKey)
	c.Next()
}
