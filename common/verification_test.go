package common

import (
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVerificationCodesAreBoundedExpiringAndSingleUse(t *testing.T) {
	for _, useRedis := range []bool{false, true} {
		t.Run(map[bool]string{false: "memory", true: "redis"}[useRedis], func(t *testing.T) {
			previousEnabled, previousClient, previousSecret := RedisEnabled, RDB, CryptoSecret
			previousMap, previousCapacity := verificationMap, verificationMapMaxSize
			verificationMap = make(map[string]verificationValue)
			verificationMapMaxSize = 2
			CryptoSecret = "test-only-verification-hmac-key"
			server := miniredis.RunT(t)
			client := redis.NewClient(&redis.Options{Addr: server.Addr()})
			RedisEnabled, RDB = useRedis, client
			t.Cleanup(func() {
				_ = client.Close()
				RedisEnabled, RDB, CryptoSecret = previousEnabled, previousClient, previousSecret
				verificationMap, verificationMapMaxSize = previousMap, previousCapacity
			})
			require.NoError(t, RegisterVerificationCodeWithKey("person@example.test", "123456", EmailVerificationPurpose))
			assert.False(t, VerifyCodeWithKey("person@example.test", "123456", PasswordResetPurpose))
			if useRedis {
				for _, key := range server.Keys() {
					assert.NotContains(t, key, "person@example.test")
					value, err := server.Get(key)
					require.NoError(t, err)
					assert.NotContains(t, value, "123456")
				}
				require.NoError(t, client.Close())
				client = redis.NewClient(&redis.Options{Addr: server.Addr()})
				RDB = client
			}
			results := make(chan bool, 2)
			var workers sync.WaitGroup
			for range 2 {
				workers.Go(func() {
					results <- ConsumeVerificationCodeWithKey("person@example.test", "123456", EmailVerificationPurpose)
				})
			}
			workers.Wait()
			close(results)
			winners := 0
			for accepted := range results {
				if accepted {
					winners++
				}
			}
			assert.Equal(t, 1, winners)
			assert.False(t, ConsumeVerificationCodeWithKey("person@example.test", "123456", EmailVerificationPurpose))

			require.NoError(t, RegisterVerificationCodeWithKey("person@example.test", "123456", PasswordResetPurpose))
			for range 10 {
				assert.False(t, VerifyCodeWithKey("person@example.test", "wrong-code", PasswordResetPurpose))
			}
			assert.False(t, VerifyCodeWithKey("person@example.test", "123456", PasswordResetPurpose))
			require.NoError(t, RegisterVerificationCodeWithKey("person@example.test", "new-code", PasswordResetPurpose))
			assert.True(t, VerifyCodeWithKey(" PERSON@example.test ", "new-code", PasswordResetPurpose))
			if useRedis {
				server.FastForward(time.Duration(VerificationValidMinutes+1) * time.Minute)
			} else {
				key := verificationStorageKey("person@example.test", PasswordResetPurpose)
				value := verificationMap[key]
				value.time = time.Now().Add(-time.Duration(VerificationValidMinutes+1) * time.Minute)
				verificationMap[key] = value
			}
			assert.False(t, ConsumeVerificationCodeWithKey("person@example.test", "new-code", PasswordResetPurpose))
			if useRedis {
				require.NoError(t, client.Close())
				assert.Error(t, RegisterVerificationCodeWithKey("person@example.test", "code", EmailVerificationPurpose))
				assert.False(t, VerifyCodeWithKey("person@example.test", "code", EmailVerificationPurpose))
			} else {
				require.NoError(t, RegisterVerificationCodeWithKey("a@example.test", "code", EmailVerificationPurpose))
				require.NoError(t, RegisterVerificationCodeWithKey("b@example.test", "code", EmailVerificationPurpose))
				assert.Error(t, RegisterVerificationCodeWithKey("c@example.test", "code", EmailVerificationPurpose))
				assert.True(t, ConsumeVerificationCodeWithKey("a@example.test", "code", EmailVerificationPurpose))
				require.NoError(t, RegisterVerificationCodeWithKey("c@example.test", "code", EmailVerificationPurpose))
			}
		})
	}
}
