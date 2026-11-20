package common

import (
	"context"
	"crypto/subtle"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type verificationValue struct {
	code     string
	time     time.Time
	attempts int
}

const (
	EmailVerificationPurpose = "v"
	PasswordResetPurpose     = "r"
)

var verificationMutex sync.Mutex
var verificationMap map[string]verificationValue
var verificationMapMaxSize = 10000
var VerificationValidMinutes = 10

func GenerateVerificationCode(length int) string {
	code := uuid.New().String()
	code = strings.Replace(code, "-", "", -1)
	if length == 0 {
		return code
	}
	return code[:length]
}

func verificationStorageKey(key, purpose string) string {
	return "verification:v2:{" + GenerateHMAC(purpose+"\x00"+strings.ToLower(strings.TrimSpace(key))) + "}"
}

func RegisterVerificationCodeWithKey(key string, code string, purpose string) error {
	if strings.TrimSpace(key) == "" || code == "" || VerificationValidMinutes <= 0 {
		return errors.New("invalid verification request")
	}
	storageKey := verificationStorageKey(key, purpose)
	digest := GenerateHMAC(storageKey + "\x00" + code)
	if RedisEnabled {
		if RDB == nil {
			return errors.New("verification storage is unavailable")
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		return RDB.Eval(ctx, `redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]); redis.call('DEL', KEYS[2]); return 1`,
			[]string{storageKey, storageKey + ":attempts"}, digest, VerificationValidMinutes*60).Err()
	}
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	removeExpiredPairs()
	if _, exists := verificationMap[storageKey]; !exists && len(verificationMap) >= verificationMapMaxSize {
		return errors.New("verification storage capacity exceeded")
	}
	verificationMap[storageKey] = verificationValue{
		code: digest,
		time: time.Now(),
	}
	return nil
}

func VerifyCodeWithKey(key string, code string, purpose string) bool {
	return verifyCodeWithKey(key, code, purpose, false)
}

// ConsumeVerificationCodeWithKey atomically claims a valid code so concurrent
// registration/reset requests cannot reuse the same authorization.
func ConsumeVerificationCodeWithKey(key string, code string, purpose string) bool {
	return verifyCodeWithKey(key, code, purpose, true)
}

func verifyCodeWithKey(key, code, purpose string, consume bool) bool {
	if strings.TrimSpace(key) == "" || code == "" {
		return false
	}
	storageKey := verificationStorageKey(key, purpose)
	digest := GenerateHMAC(storageKey + "\x00" + code)
	if RedisEnabled {
		if RDB == nil {
			return false
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		consumeFlag := 0
		if consume {
			consumeFlag = 1
		}
		result, err := RDB.Eval(ctx, `
local expected = redis.call('GET', KEYS[1])
if not expected then return 0 end
if expected ~= ARGV[1] then
  local attempts = redis.call('INCR', KEYS[2])
  if attempts == 1 then redis.call('EXPIRE', KEYS[2], ARGV[2]) end
  if attempts >= 10 then redis.call('DEL', KEYS[1], KEYS[2]) end
  return 0
end
if ARGV[3] == '1' then redis.call('DEL', KEYS[1], KEYS[2]) end
return 1`, []string{storageKey, storageKey + ":attempts"}, digest, VerificationValidMinutes*60, consumeFlag).Int()
		return err == nil && result == 1
	}
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	value, okay := verificationMap[storageKey]
	now := time.Now()
	if !okay || int(now.Sub(value.time).Seconds()) >= VerificationValidMinutes*60 {
		delete(verificationMap, storageKey)
		return false
	}
	if subtle.ConstantTimeCompare([]byte(digest), []byte(value.code)) != 1 {
		value.attempts++
		if value.attempts >= 10 {
			delete(verificationMap, storageKey)
		} else {
			verificationMap[storageKey] = value
		}
		return false
	}
	if consume {
		delete(verificationMap, storageKey)
	}
	return true
}

func DeleteKey(key string, purpose string) {
	storageKey := verificationStorageKey(key, purpose)
	if RedisEnabled && RDB != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = RDB.Del(ctx, storageKey, storageKey+":attempts").Err()
	}
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	delete(verificationMap, storageKey)
}

// no lock inside, so the caller must lock the verificationMap before calling!
func removeExpiredPairs() {
	now := time.Now()
	for key := range verificationMap {
		if int(now.Sub(verificationMap[key].time).Seconds()) >= VerificationValidMinutes*60 {
			delete(verificationMap, key)
		}
	}
}

func init() {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap = make(map[string]verificationValue)
}
