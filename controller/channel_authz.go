package controller

import (
	"fmt"
	"reflect"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// A round-trip marker, never an upstream header value. All literal headers are
// confidential: credentials can use arbitrary names, not only Authorization.
const redactedChannelHeader = "__NEW_API_REDACTED_HEADER__"

func redactChannelHeaders(channel *model.Channel) {
	if channel.HeaderOverride == nil || *channel.HeaderOverride == "" {
		return
	}
	var headers map[string]any
	if err := common.UnmarshalJsonStr(*channel.HeaderOverride, &headers); err != nil {
		channel.HeaderOverride = nil // fail closed on legacy malformed configuration
		return
	}
	for key, value := range headers {
		if _, literal := value.(string); literal {
			headers[key] = redactedChannelHeader
		}
	}
	encoded, err := common.Marshal(headers)
	if err != nil {
		channel.HeaderOverride = nil
		return
	}
	channel.HeaderOverride = common.GetPointer(string(encoded))
}

// Restore unchanged redacted entries from storage before authorization checks.
// This preserves credentials when a read-only operator edits routing fields.
func restoreChannelHeaders(channel *model.Channel, origin *model.Channel) error {
	if channel.HeaderOverride == nil || *channel.HeaderOverride == "" {
		return nil
	}
	var headers map[string]any
	if err := common.UnmarshalJsonStr(*channel.HeaderOverride, &headers); err != nil {
		return err
	}
	var original map[string]any
	if origin.HeaderOverride != nil && *origin.HeaderOverride != "" {
		if err := common.UnmarshalJsonStr(*origin.HeaderOverride, &original); err != nil {
			return err
		}
	}
	for key, value := range headers {
		if value != redactedChannelHeader {
			continue
		}
		old, exists := original[key]
		if !exists {
			return fmt.Errorf("redacted header has no stored value")
		}
		headers[key] = old
	}
	if reflect.DeepEqual(headers, original) {
		channel.HeaderOverride = origin.HeaderOverride
		return nil
	}
	encoded, err := common.Marshal(headers)
	if err != nil {
		return err
	}
	channel.HeaderOverride = common.GetPointer(string(encoded))
	return nil
}

func channelHasSensitiveChanges(channel *PatchChannel, origin *model.Channel, requestData map[string]any) bool {
	if _, ok := requestData["type"]; ok && channel.Type != origin.Type {
		return true
	}
	if _, ok := requestData["key"]; ok && channel.Key != "" && channel.Key != origin.Key {
		return true
	}
	if _, ok := requestData["base_url"]; ok && !equalStringPtr(channel.BaseURL, origin.BaseURL) {
		return true
	}
	if _, ok := requestData["openai_organization"]; ok && !equalStringPtr(channel.OpenAIOrganization, origin.OpenAIOrganization) {
		return true
	}
	if _, ok := requestData["header_override"]; ok && !equalStringPtr(channel.HeaderOverride, origin.HeaderOverride) {
		return true
	}
	if _, ok := requestData["param_override"]; ok && !equalStringPtr(channel.ParamOverride, origin.ParamOverride) {
		return true
	}
	if _, ok := requestData["setting"]; ok && !equalStringPtr(channel.Setting, origin.Setting) {
		return true
	}
	if _, ok := requestData["other"]; ok && channel.Other != origin.Other {
		return true
	}
	if _, ok := requestData["settings"]; ok && channel.OtherSettings != origin.OtherSettings {
		return true
	}
	if _, ok := requestData["key_mode"]; ok && channel.KeyMode != nil {
		return true
	}
	// Fail closed: any field present in the request that is neither a known
	// sensitive field (gated above) nor an explicitly classified non-sensitive
	// field must be treated as sensitive. This keeps a newly added channel field
	// from silently becoming editable by ChannelWrite-only admins until it is
	// consciously classified in channelNonSensitiveFields.
	for field := range requestData {
		if _, ok := channelSensitiveFields[field]; ok {
			continue
		}
		if _, ok := channelNonSensitiveFields[field]; ok {
			continue
		}
		if _, ok := channelOperationalFields[field]; ok {
			continue
		}
		if _, ok := channelReadOnlyFields[field]; ok {
			continue
		}
		return true
	}
	return false
}

// channelSensitiveFields lists the channel fields whose modification requires
// ChannelSensitiveWrite. They are each checked individually in
// channelHasSensitiveChanges with a precise old-vs-new comparison; this set is
// used to exclude them from the fail-closed scan for unknown fields.
var channelSensitiveFields = map[string]struct{}{
	"type":                {},
	"key":                 {},
	"base_url":            {},
	"openai_organization": {},
	"header_override":     {},
	"param_override":      {},
	"setting":             {},
	"other":               {},
	"settings":            {},
	"key_mode":            {},
}

// channelOperationalFields lists fields managed by operation endpoints instead
// of the general channel edit endpoint.
var channelOperationalFields = map[string]struct{}{
	"status": {},
}

// channelReadOnlyFields lists server-managed/accounting fields that the general
// channel edit endpoint must ignore even if a client sends them.
var channelReadOnlyFields = map[string]struct{}{
	"created_time":         {},
	"test_time":            {},
	"response_time":        {},
	"balance":              {},
	"balance_updated_time": {},
	"used_quota":           {},
}

func clearChannelReadOnlyFields(channel *PatchChannel, requestData map[string]any) {
	if _, ok := requestData["created_time"]; ok {
		channel.CreatedTime = 0
	}
	if _, ok := requestData["test_time"]; ok {
		channel.TestTime = 0
	}
	if _, ok := requestData["response_time"]; ok {
		channel.ResponseTime = 0
	}
	if _, ok := requestData["balance"]; ok {
		channel.Balance = 0
	}
	if _, ok := requestData["balance_updated_time"]; ok {
		channel.BalanceUpdatedTime = 0
	}
	if _, ok := requestData["used_quota"]; ok {
		channel.UsedQuota = 0
	}
}

// channelNonSensitiveFields lists routing / server-managed channel
// fields a ChannelWrite admin may edit without ChannelSensitiveWrite. When a new
// field is added to model.Channel it must be added to either this set or
// channelSensitiveFields or channelOperationalFields; otherwise it falls through
// to the fail-closed branch and is treated as sensitive. The
// TestChannelFieldsAreClassified guard test enforces this.
var channelNonSensitiveFields = map[string]struct{}{
	"id":                  {},
	"test_model":          {},
	"name":                {},
	"weight":              {},
	"models":              {},
	"group":               {},
	"model_mapping":       {},
	"status_code_mapping": {},
	"priority":            {},
	"auto_ban":            {},
	"other_info":          {},
	"tag":                 {},
	"remark":              {},
	"channel_info":        {},
	"multi_key_mode":      {},
}
