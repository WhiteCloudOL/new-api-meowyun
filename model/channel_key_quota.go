package model

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const channelKeyQuotaCooldown = 10 * time.Minute

// Redis shares the preference across nodes and application restarts. The local
// mirror is a best-effort fallback when Redis is disabled or unavailable.
var channelKeyQuotaFallback sync.Map

func channelKeyQuotaCacheKey(channelID int, key string) string {
	return fmt.Sprintf("channel_key_quota:%d:%x", channelID, sha256.Sum256([]byte(key)))
}

// MarkChannelKeyQuotaExhausted demotes the credential temporarily, without
// changing its enabled state or preventing its use as a last-resort key.
func MarkChannelKeyQuotaExhausted(channelID int, key string) {
	if channelID <= 0 || key == "" {
		return
	}
	now := time.Now().Unix()
	channelKeyQuotaFallback.Range(func(key, value any) bool {
		if value.(int64) <= now {
			channelKeyQuotaFallback.Delete(key)
		}
		return true
	})
	cacheKey := channelKeyQuotaCacheKey(channelID, key)
	expires := time.Now().Add(channelKeyQuotaCooldown).Unix()
	channelKeyQuotaFallback.Store(cacheKey, expires)
	if common.RedisEnabled && common.RDB != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
		defer cancel()
		_ = common.RDB.Set(ctx, cacheKey, expires, channelKeyQuotaCooldown).Err()
	}
}

// ClearChannelKeyQuotaExhausted restores a successful backup key immediately.
func ClearChannelKeyQuotaExhausted(channelID int, key string) {
	cacheKey := channelKeyQuotaCacheKey(channelID, key)
	if _, known := channelKeyQuotaFallback.LoadAndDelete(cacheKey); !known {
		return
	}
	if common.RedisEnabled && common.RDB != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
		defer cancel()
		_ = common.RDB.Del(ctx, cacheKey).Err()
	}
}

func channelKeysWithExhaustedQuota(channelID int, keys []string) map[[32]byte]struct{} {
	cacheKeys := make([]string, len(keys))
	for i, key := range keys {
		cacheKeys[i] = channelKeyQuotaCacheKey(channelID, key)
	}
	if common.RedisEnabled && common.RDB != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
		values, err := common.RDB.MGet(ctx, cacheKeys...).Result()
		cancel()
		if err == nil {
			for i, value := range values {
				raw, _ := value.(string)
				expires, _ := strconv.ParseInt(raw, 10, 64)
				if expires > time.Now().Unix() {
					channelKeyQuotaFallback.Store(cacheKeys[i], expires)
				} else {
					channelKeyQuotaFallback.Delete(cacheKeys[i])
				}
			}
		}
	}
	exhausted := make(map[[32]byte]struct{})
	now := time.Now().Unix()
	for i, cacheKey := range cacheKeys {
		if value, ok := channelKeyQuotaFallback.Load(cacheKey); ok {
			if value.(int64) > now {
				exhausted[sha256.Sum256([]byte(keys[i]))] = struct{}{}
			} else {
				channelKeyQuotaFallback.Delete(cacheKey)
			}
		}
	}
	return exhausted
}
