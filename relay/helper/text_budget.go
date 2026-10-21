package helper

import (
	"bytes"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

// MaxTextCandidates bounds multiplicative output counts independently of a
// provider's per-candidate output-token ceiling.
const MaxTextCandidates = 128

// Duplicate limit fields (including duplicate parent objects) are ambiguous:
// JSON consumers differ in choosing the first or last value. Inspect decoded
// keys so escaped spellings cannot hide a second effective limit either.
func textOutputLimitField(object gjson.Result, path string) (gjson.Result, bool) {
	for part := range strings.SplitSeq(path, ".") {
		var value gjson.Result
		matches := 0
		ambiguous := false
		object.ForEach(func(key, candidate gjson.Result) bool {
			if strings.EqualFold(key.String(), part) {
				matches++
				value = candidate
				// SDK JSON decoders may match case-insensitively, while HTTP
				// providers ignore non-canonical keys. Neither is safe to guess.
				ambiguous = ambiguous || key.String() != part
			}
			return matches < 2
		})
		if matches > 1 || ambiguous {
			return gjson.Result{}, true
		}
		object = value
	}
	return object, false
}

// PrepareTextBillingBody also covers non-HTTP transports (AWS SDK and provider
// WebSockets). Replayable storage is inspected without consuming its cursor.
func PrepareTextBillingBody(c *gin.Context, info *relaycommon.RelayInfo, body io.Reader) (io.Reader, error) {
	if !info.EnforceTextBudget || body == nil {
		return body, nil
	}
	reader := body
	replay, ok := body.(common.ReplayableBody)
	if ok {
		independent, err := replay.NewReader()
		if err != nil {
			return nil, err
		}
		defer independent.Close()
		reader = independent
	}
	limit := int64(max(constant.MaxRequestBodyMB, 1)) * 1024 * 1024
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("text request exceeds the maximum body size")
	}
	if err := ReserveTextOutputQuota(c, info, data); err != nil {
		return nil, err
	}
	if ok {
		return body, nil
	}
	return bytes.NewReader(data), nil
}

// ReserveTextOutputQuota inspects the actual outgoing payload, after channel
// conversion/overrides. Client limits hidden in tool schemas or messages are
// not limits on generation and must never satisfy this check.
func ReserveTextOutputQuota(c *gin.Context, info *relaycommon.RelayInfo, body []byte) error {
	price := info.PriceData
	if !info.EnforceTextBudget || price.GroupRatioInfo.GroupRatio == 0 || price.UsePrice ||
		info.TieredBillingSnapshot == nil && price.ModelRatio == 0 {
		return nil
	}
	if !gjson.ValidBytes(body) {
		return types.NewErrorWithStatusCode(fmt.Errorf("invalid text request JSON"), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	// Only the destination protocol's effective limits count. Accepting a cap
	// from another provider's schema lets passthrough clients forge a limit
	// that the actual upstream silently ignores.
	capPaths := []string{"max_tokens", "max_completion_tokens"}
	countPaths := []string{"n", "best_of"}
	format := info.GetFinalRequestRelayFormat()
	switch format {
	case types.RelayFormatOpenAIResponses, types.RelayFormatOpenAIResponsesCompaction:
		capPaths, countPaths = []string{"max_output_tokens"}, nil
	case types.RelayFormatClaude:
		capPaths, countPaths = []string{"max_tokens"}, nil
	case types.RelayFormatGemini:
		// Protobuf JSON accepts both field names and lowerCamelCase names.
		capPaths = []string{"generationConfig.maxOutputTokens", "generationConfig.max_output_tokens", "generation_config.maxOutputTokens", "generation_config.max_output_tokens"}
		countPaths = []string{"generationConfig.candidateCount", "generationConfig.candidate_count", "generation_config.candidateCount", "generation_config.candidate_count"}
	}
	if info.ChannelMeta != nil {
		switch info.ApiType {
		case constant.APITypeBaidu:
			capPaths, countPaths = []string{"max_output_tokens"}, nil
		case constant.APITypeAws:
			capPaths, countPaths = []string{"max_tokens"}, nil
			if strings.Contains(info.UpstreamModelName, "nova-") {
				capPaths = []string{"inferenceConfig.maxTokens"}
			}
		case constant.APITypeOllama:
			if format != types.RelayFormatClaude && format != types.RelayFormatOpenAIResponses &&
				format != types.RelayFormatOpenAIResponsesCompaction && !info.ChannelOtherSettings.OllamaOpenAIChat {
				capPaths, countPaths = []string{"options.num_predict"}, nil
			}
		case constant.APITypePaLM, constant.APITypeDify, constant.APITypeCoze, constant.APITypeZhipu, constant.APITypeTencent:
			// These legacy converters do not send an enforceable output cap.
			capPaths, countPaths = nil, nil
		}
	}
	object := gjson.ParseBytes(body)
	maxOutput := float64(0)
	for _, path := range capPaths {
		value, ambiguous := textOutputLimitField(object, path)
		if ambiguous {
			return types.NewErrorWithStatusCode(fmt.Errorf("%s", i18n.T(c, i18n.MsgQuotaOutputQuantityInvalid, map[string]any{"Field": path})), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
		}
		if !value.Exists() {
			continue
		}
		quantity := value.Float()
		if value.Type != gjson.Number || quantity <= 0 || quantity > maxTokensLimit || math.Trunc(quantity) != quantity {
			return types.NewErrorWithStatusCode(fmt.Errorf("%s", i18n.T(c, i18n.MsgQuotaOutputQuantityInvalid, map[string]any{"Field": path})), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
		}
		maxOutput = max(maxOutput, quantity)
	}
	candidates := float64(1)
	for _, path := range countPaths {
		value, ambiguous := textOutputLimitField(object, path)
		if ambiguous {
			return types.NewErrorWithStatusCode(fmt.Errorf("%s", i18n.T(c, i18n.MsgQuotaOutputQuantityInvalid, map[string]any{"Field": path})), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
		}
		if !value.Exists() {
			continue
		}
		quantity := value.Float()
		if value.Type != gjson.Number || quantity < 1 || quantity > MaxTextCandidates || math.Trunc(quantity) != quantity {
			return types.NewErrorWithStatusCode(fmt.Errorf("%s", i18n.T(c, i18n.MsgQuotaOutputQuantityInvalid, map[string]any{"Field": path})), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
		}
		candidates = max(candidates, quantity)
	}
	maxOutput *= candidates
	if maxOutput > maxTokensLimit {
		return types.NewErrorWithStatusCode(fmt.Errorf("%s", i18n.T(c, i18n.MsgQuotaOutputQuantityInvalid, map[string]any{"Field": "maximum output tokens"})), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	outputPriced := price.CompletionRatio > 0 || price.AudioCompletionRatio > 0
	if snapshot := info.TieredBillingSnapshot; snapshot != nil {
		vars := billingexpr.UsedVarsByHash(snapshot.ExprString, snapshot.ExprHash)
		outputPriced = vars["c"] || vars["ao"] || vars["img_o"]
	}
	if outputPriced && maxOutput == 0 {
		return types.NewErrorWithStatusCode(fmt.Errorf("%s", i18n.T(c, i18n.MsgQuotaOutputLimitRequired)), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	multiplier, err := operation_setting.InputPreConsumeMultiplier()
	if err != nil {
		return err
	}
	// A reservation discount cannot underfund a strict prepaid request. Actual
	// administrator prices and final settlement are never multiplied here.
	multiplier = max(1, multiplier)
	prompt := float64(info.GetEstimatePromptTokens())
	var beforeGroup float64
	if snapshot := info.TieredBillingSnapshot; snapshot != nil {
		request := billingexpr.RequestInput{}
		if info.BillingRequestInput != nil {
			request = *info.BillingRequestInput
		}
		cost, err := billingexpr.ReservationUpperBound(snapshot.ExprString, snapshot.ExprHash, prompt, maxOutput, request)
		if err != nil {
			return types.NewErrorWithStatusCode(err, types.ErrorCodeModelPriceError, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
		}
		beforeGroup = cost / 1_000_000 * snapshot.QuotaPerUnit * multiplier
	} else {
		inputRatio := max(1, price.CacheRatio, price.CacheCreationRatio, price.CacheCreation5mRatio, price.CacheCreation1hRatio, price.ImageRatio, price.AudioRatio)
		outputRatio := max(price.CompletionRatio, price.AudioRatio*price.AudioCompletionRatio)
		beforeGroup = (prompt*inputRatio*multiplier + maxOutput*outputRatio) * price.ModelRatio
	}
	quota, err := common.QuotaFromFloatStrict(math.Ceil(beforeGroup * price.GroupRatioInfo.GroupRatio))
	if err != nil {
		return types.NewErrorWithStatusCode(err, types.ErrorCodeModelPriceError, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	if quota > 0 {
		if apiErr := service.PreConsumeBilling(c, quota, info); apiErr != nil {
			return apiErr
		}
	}
	if snapshot := info.TieredBillingSnapshot; snapshot != nil {
		snapshot.EstimatedCompletionTokens = common.QuotaFromFloat(maxOutput)
		snapshot.EstimatedQuotaBeforeGroup = beforeGroup
		snapshot.EstimatedQuotaAfterGroup = quota
	}
	return nil
}
