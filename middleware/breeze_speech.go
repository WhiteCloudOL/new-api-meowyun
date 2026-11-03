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
	batch := c.Request.URL.Path == relaycommon.BreezeBatchPath
	if _, ok := pluginruntime.DefaultRegistry.Generation().Get(model); !ok {
		if batch {
			abortWithOpenAiMessage(c, http.StatusNotFound, "BreezeTTS is unavailable")
			return
		}
		c.Next()
		return
	}
	media, _, _ := mime.ParseMediaType(c.GetHeader("Content-Type"))
	form := media == "multipart/form-data" || media == "application/x-www-form-urlencoded"

	jsonBody := media == "application/json" || strings.HasSuffix(media, "+json")
	if !form && !batch && !jsonBody {
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
			for _, key := range []string{"model", "text", "texts", "instruction", "cfg_scale", "ref_text", "seed", "max_new_tokens"} {
				values := fields[key]
				if len(values) > 1 {
					return fmt.Errorf("speech field %q must appear only once", key)
				}
				if len(values) == 1 {
					body[key] = values[0]
				}
			}
			body["response_format"] = "pcm"
			body["breeze_native_pcm"] = !batch
		} else {
			raw, err := storage.Bytes()
			if err != nil {
				return err
			}
			if err := common.Unmarshal(raw, &body); err != nil || body == nil {
				return fmt.Errorf("invalid speech JSON object")
			}
		}
		if !form && !batch {
			// A native text field is unambiguous. Leave OpenAI requests and
			// explicitly named models on their existing routing path.
			text, native := body["text"].(string)
			if !native || body["input"] != nil || body["model"] != nil && body["model"] != "" {
				return nil
			}
			body["input"] = text
			body["response_format"] = "pcm"
			body["breeze_native_pcm"] = true
		}
		name, modelIsString := body["model"].(string)
		if body["model"] != nil && !modelIsString {
			return fmt.Errorf("model must be a string")
		}
		if name != "" && !strings.EqualFold(name, model) {
			return fmt.Errorf("native BreezeTTS synthesis requires model %s", model)
		}
		body["model"] = model
		if batch {
			var texts []string
			raw, ok := body["texts"].(string)
			if !ok {
				encoded, err := common.Marshal(body["texts"])
				if err != nil {
					return err
				}
				raw = string(encoded)
			}
			if len(raw) > 128<<10 || common.UnmarshalJsonStr(raw, &texts) != nil || len(texts) == 0 || len(texts) > 128 {
				return fmt.Errorf("texts must contain 1 to 128 strings")
			}
			for _, text := range texts {
				if strings.TrimSpace(text) == "" {
					return fmt.Errorf("texts must contain non-empty strings")
				}
			}
			body["texts"] = texts
			body["input"] = strings.Join(texts, "")
			body["response_format"] = "pcm"
		} else if body["input"] == nil {
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
	if _, ok := pluginruntime.DefaultRegistry.Generation().Get(model); !ok {
		abortWithOpenAiMessage(c, http.StatusNotFound, "BreezeTTS is unavailable")
		return
	}
	c.Set("resolved_task_model", model)
	c.Set("expected_task_plugin_key", model)
	c.Next()
}
