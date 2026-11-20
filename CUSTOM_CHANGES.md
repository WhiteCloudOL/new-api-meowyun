# Meowyun custom changes

## 2026-11-20: free flow layout and security assessment

Free requests now retain their Sankey links and owning users. Only connected nodes enter the chart; an entirely free, zero-token selection uses request counts for layout geometry while keeping the displayed monetary/token totals unchanged. BreezeTTS remains one node per real channel ID. The regression tests exercise the actual VChart layout, including mixed paid/free traffic.

The November 19 assessment is addressed with server-side security headers (including hashed bootstrap scripts), same-origin management APIs, credential-free relay CORS, sanitized custom footer HTML, fixed Midjourney compatibility prefixes, and authenticated image ownership or image-bound signed capabilities. Unknown configuration/debug paths return 404. Initialization responses omit installation metadata, token lookups use meaningful HTTP errors, pagination is bounded, sidebar settings are validated, and non-admin model catalogs respect upstream privacy.

Password reset now accepts a user-chosen password, never returns it, invalidates existing sessions, and uses short-lived single-use verification. Reset credentials travel in a URL fragment and are removed from browser history. Redis stores HMAC-derived keys and code digests; verification has expiry, bounded attempts, atomic consumption, and fails closed on Redis errors. Memory-only deployments have a bounded store. Mail issuance uses generic asynchronous responses and a mailbox budget shared across registration and recovery. Critical IP budgets are scoped per endpoint; successful password login clears that account's failed-attempt budget. Username changes require a fresh proof bound to the exact new name and generate an audit event and security notice. Existing password inputs, form components, HTML sanitizer, and security-proof infrastructure are reused.

Creem requires a configured webhook secret and a valid signature in both live and test modes. Payment callback diagnostics omit raw payloads, signatures, query strings, and customer details. Settlement logic and prices are unchanged. Go 1.26.11 and patched compression, crypto/network, and frontend dependencies replace versions identified by the vulnerability scans. CI now scans Go and production Bun dependencies, and Dependabot covers all three Go modules.

Deployment hardening: explicitly save `CreemTestMode=false`; narrow `TRUSTED_PROXIES` to loopback and the actual Docker gateway; trust Cloudflare visitor headers only from its published IPv4/IPv6 networks; overwrite inbound XFF at OpenResty; apply HSTS on error responses; omit query strings from this site's proxy access log; require login for rankings. Public version strings use a semantic fork version rather than the exact Git commit. A fresh PostgreSQL custom-format dump and application/proxy configuration snapshot are retained before updating.

Security references: [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/), [Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), and [HTTP Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html). Verification covers code expiry, replay/concurrent consumption, recipient limits, operation binding, session invalidation, image ownership, callback signatures in both modes, diagnostic redaction, CORS, and security headers. This is a scoped remediation, not an assertion of complete ASVS compliance.

Report triage: Turnstile cannot be enabled without operator-provided site/secret credentials; mailbox/IP/attempt controls provide the implemented abuse mitigation. A 90-day reservation of previous usernames is a separate product/data-retention policy and is not introduced here. Public OAuth client IDs, Passkey RP IDs, model names, and prices are intentional metadata, not credentials; the published provider-type dictionary is not a list of live channels. HTTPS already encrypts login passwords in transit; optional additional RSA wrapping is not required for TLS security and is not forced on clients. Existing pricing, channel credentials, and project/author attribution remain intact.

Validation: frontend `vitest run --maxWorkers=4` passed 241 files / 2,899 tests; `bun check -b`, affected-file oxlint/oxfmt, `bun run i18n:sync`, and the production build passed. Production Bun audit and Go govulncheck v1.10.0 reported no findings after upgrades. Root `go vet ./...`, the production Linux build, and independent `GOWORK=off go build ./...` in `relaykit/` and `tokenkit/` passed. Real SQLite 3.50.4, MySQL 5.7.44, and PostgreSQL 15.19 exercised the password-reset/session, username proof/replay, sidebar validation, and image-ownership regressions. External engines ran in disposable loopback-only containers; production data was not used for these tests. The matrix command used the compiled controller suite with `TEST_SECURITY_DIALECT=<dialect>` and `-test.run 'TestPasswordResetUses|TestMidjourneyImageOwnership|TestSecurityAccountUsername|TestSecurityAccountSidebar|TestSecurityAccountProfileUpdateDoesNotRequireProof' -test.count=1`.

Broader backend verification is not fully green: the constrained Linux run hit the controller suite's 12-minute timeout, a WebSocket timing assertion, and the existing device-login poll timing assertion (also reproducible in isolation). Running copied binaries without repository fixtures additionally failed the pricing fixture and source-scanning tests; the scope-source test passed when run locally from the repository. A Windows model-management run passed its behavior assertions but failed cleanup because its existing database fixture retains an open `audit.db` handle. The pagination rejection regression discovered during this run was corrected without weakening the existing audit/model endpoint validation. These limitations are recorded separately from the passing focused security and database matrix checks.

Last verified: 2026-08-11

This fork keeps the custom Alibaba Cloud Model Studio CosyVoice integration used by the Meowyun deployment. Production currently runs the fork build described below.

## Goal

- Accept OpenAI-compatible `POST /v1/audio/speech` requests in NewAPI.
- Convert those requests to Alibaba Cloud Model Studio's CosyVoice HTTP API through the bundled compatibility service.
- Bill Alibaba Cloud Model Studio TTS by the upstream-reported input character count.
- Keep all other OpenAI-compatible TTS channels on NewAPI's standard audio-duration billing path.
- Show character-based usage accurately in desktop, mobile, and detail log views.

## NewAPI changes

### Character billing handshake

`custom/cosyvoice-openai/app.py` reads `usage.characters` from the Alibaba response and adds this internal response header:

```text
X-NewAPI-Usage-Characters: <non-negative integer>
```

`relay/channel/openai/audio.go` consumes and removes the header before copying upstream headers to the client. When present and valid, the value becomes the request's prompt usage, completion/audio usage becomes zero, and NewAPI performs normal token-price settlement using the character count as the input quantity.

When the header is absent, the existing OpenAI TTS duration calculation is unchanged. An invalid header is removed, logged, and falls back to the standard duration path.

`service/log_info_generate.go` stores these fields in the usage log's `other` data:

```json
{
  "billing_unit": "characters",
  "billing_characters": 29
}
```

The usage-log frontend displays these requests as characters rather than tokens. The model editor also includes the `openai-tts` endpoint template for `/v1/audio/speech`.

### Pricing

Pricing remains database configuration and is not hard-coded in this fork. For character billing, configure the model's input price per 1M units. For example, an input price of `3` means:

```text
charge before group multipliers = characters * 3 / 1,000,000 USD
```

The current deployment deliberately uses a higher numerical USD price than Alibaba's RMB list price. Preserve that operator choice during upgrades. Do not add an audio-output price to a character-billed CosyVoice model unless the intended charging policy changes.

## Compatibility service

Source, tests, image definition, and a sanitized Compose example are kept together in `custom/cosyvoice-openai/`. No API key or production password is committed. See `custom/cosyvoice-openai/README.md` for configuration.

## Upgrade checklist

1. Update this fork's `main` branch using the desired source release.
2. Resolve conflicts without dropping the character-header handling, log metadata, frontend character display, or the `openai-tts` endpoint template.
3. Keep `custom/cosyvoice-openai/` in the same repository.
4. Run the validation commands below before building images.
5. Build versioned images; do not overwrite a known-good tag.
6. Back up the database and Compose configuration before deploying.
7. Verify one character-billed CosyVoice request and one ordinary OpenAI TTS request after deployment.

## Validation

From the repository root:

```bash
gofmt -w relay/channel/openai/audio.go relay/channel/openai/audio_billing_test.go service/log_info_generate.go
go test ./relay/channel/openai ./service

cd custom/cosyvoice-openai
python -m unittest -v test_app.py
python -m py_compile app.py test_app.py

cd ../../web
bun install
bun run typecheck
bun run lint
bun run build
```

Before committing, also run `git diff --check` and scan the added files for credentials.

## Production deployment

- Deployed on 2026-08-11 from code commit `eb56228a4351a9ae7cc3d321d2b13d7e072095f7`.
- NewAPI image: `meowyun/new-api:fork-eb56228a`.
- Previous rollback image: `meowyun/new-api:v1.0.0-rc.23-openai-tts.1`.
- CosyVoice image remains `meowyun/cosyvoice-openai:1.1`; its container was not recreated during the NewAPI update.
- Server source checkout: `/root/new-api/.fork-src`.
- Pre-deployment backup: `/root/new-api/.backups/20260811-173036-pre-fork-eb56228a` and the matching local `.server-backups/` directory.

Production verification used a seven-character request through NewAPI. The response was `audio/mpeg`, the usage log recorded seven input characters and zero completion tokens, and `billing_unit` was `characters`. The preserved database price is `ModelRatio=80` with group ratio `1`, so the expected charge is `ceil(7 * 80) = 560` quota units. With NewAPI's `$2/1M` baseline per ratio unit, this is a configured price of `$160/1M` characters. That numerical price is intentionally above Alibaba Cloud Model Studio's Beijing list price of RMB 100 per million characters when the display number is treated as RMB.

The following checks passed for this deployment:

```bash
go test ./relay/channel/openai
go test ./service -run 'Test(GenerateTextOtherInfoIncludesCharacterBilling|GenerateTextOtherInfoOmitsCharacterBillingForNormalRequests|CharacterBilledTTSUsesTextInputRatio)$' -count=1
python -B -m unittest -v custom/cosyvoice-openai/test_app.py
```

The full `go test ./service` run had one shared-state failure in `TestObserveChannelAffinityUsageCacheByRelayFormat_MixedMode`; that unrelated test passed when rerun alone.

## Upstream synchronization, 2026-11-15

This update merges upstream `b388140acfd80369ec6243b16869daff1b4051f4`, including the provider plugins, request processing plugins, community marketplace, and MoeForge runtime from v1.0.0-rc.51. Existing fork integrations remain: Breeze-TTS-2.cpp JSON/form/PCM streaming and voice-library routes, Alibaba speech, character/request billing, prepaid funding limits, RinkoAI, wallet customization, and downstream upstream-information privacy for both speech and LLM channels.

Alibaba speech configuration now uses upstream `meta.channelConfig`, `ChannelConfigFor`, and the shared channel configuration form. The duplicate `configDefaults` API and JSON editor were removed. Existing `setting.task_plugin_config` values remain readable until a channel is saved in the official `settings.plugin_config` format. The synchronous speech protocol remains a host extension because upstream's asynchronous task driver does not provide that contract. The old sensitive-word implementation is replaced by upstream's request-filter migration and plugin.

Provider plugins that convert a request into uploads, generation, and polling reserve a conservative output budget before their first network request. File uploads and bodyless polls reuse that reservation; JSON generation steps still validate the actual outgoing limits. A client output cap cannot reduce the reservation for an opaque provider protocol, and invalid candidate counts fail before an upload.

The wallet redemption banner uses a new original anime illustration generated with the image generation tool, exported as a 768-pixel WebP with an alpha channel. The existing banner component displays the complete illustration with `object-contain`.

### Verification

- Frontend: `bun check -b`, `bun run build`, and the complete Vitest run (238 files, 2,888 tests) passed. Oxlint and Oxfmt passed for the changed frontend files. The whole-repository lint/format commands still report existing issues outside this change; they are not represented as passing checks.
- Root Go: `go test ./... -count=1` was run on Windows. SQLite file cleanup and two HTTP/2 socket tests require Linux verification. Linux controller/router/relay-channel test binaries were built with `GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go test -c`; Linux reruns also supplied the source fixtures needed by the controller and router tests. Failed controller database cases were rerun against disposable loopback-only databases. Speech refund tests now wait for the documented asynchronous refund, and the redemption audit test creates an explicitly scoped PAT instead of depending on another test's legacy-token deadline.
- Modules: `GOWORK=off go build ./...` and `GOWORK=off go test ./... -count=1` passed independently in both `relaykit/` and `tokenkit/`.
- Database versions: SQLite 3.50.4, MySQL 5.7.44, PostgreSQL 15.19. The complete `model.test -test.v -test.timeout=5m` passed with `TEST_MYSQL_DSN` and `TEST_POSTGRES_DSN`; `model.test -test.run TestScheduledChannel` passed with each `TEST_TASK_DB_DIALECT`. Controller provider/channel/pricing/routing database cases ran on all three engines with dedicated databases. No production DSN was used by these tests.
- Actual application startup was exercised twice on fresh databases and twice after upgrading seeded databases from the deployed `fork-85b815a17` image, on all three engines. Separate log databases covered PostgreSQL, MySQL, and SQLite. Schema snapshots stayed stable on the second startup; large wallet balances, channel configuration, log JSON, and migrated request-filter settings survived. The same upgrade checks also run from the latest official release, v1.0.0-rc.51.

Authentication-related upstream integration was reviewed against OWASP ASVS 5.0.0 and the [Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), and [OAuth2](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html) guidance. Applicable controls include server-side permission checks, session/user/plugin-bound short-lived state, atomic single-use completion, PKCE/state/issuer checks, credential redaction, and exclusion of usable secrets from audit events. Existing provider-login regression cases cover wrong sessions/providers/steps, expiry, callback mismatch, replay, concurrent completion, and secret-free views/logs; these checks are not a claim of application-wide ASVS certification.

Sta1n `gemini-4-hydrogen` was investigated without changing its channel or request conversion. Direct upstream probes returned 200 with no tools, 400 for a `terms` array schema without `items`, and 200 when `items: {"type":"string"}` was supplied. The recorded error identifies a malformed or incompatible tool schema; the original failing client request is not stored, so the evidence does not establish whether the missing member originated in the client or in upstream conversion.

## Multi-key quota failover, 2026-11-16

For an upstream HTTP 402 with `insufficient_balance` (including the provider's `[code=insufficient_balance]` message), an allowed retry first tries another enabled key on the same channel. Failed credentials are excluded by SHA-256 fingerprint for that request, including duplicate or reordered keys. When no key remains, normal channel priority fallback resumes. Existing retry status settings, attempt budgets, single-attempt pins, and local authentication/quota rejections are preserved; ordinary HTTP 400 errors are not made retryable. Request-local exclusions do not disable keys globally; existing automatic-disabling settings still apply.

Validation: `go test ./controller -run 'TestInsufficientBalanceRetriesAnotherKeyBeforeLowerPriority|TestShouldRetryHonorsPinRetryMode' -count=1` passed, including 48 cache/strategy/error cases. `go test ./model ./service -count=1` passed. Linux controller checks also covered existing affinity, pin and routing regression cases. Middleware tests were run on Linux because Windows keeps the log-rotation test's file open during temporary-directory cleanup. No schema, driver, pricing, or billing settlement changes are included. Credential transport and secret-free diagnostic handling follow the OWASP guidance referenced above; request exclusions retain only fingerprints.

Quota-exhausted credentials also become backup keys for ten minutes. Redis stores only channel-scoped credential fingerprints and expiry times, sharing the preference across requests, nodes, and application restarts; an in-memory mirror covers Redis outages or deployments without Redis. Redis I/O has a 200 ms deadline and runs outside the channel polling lock. Enabled primary keys are preferred; when none remain, backup keys are still eligible. A successful backup clears its cooldown immediately, expiry restores normal selection, and manually disabled keys remain disabled. Existing retry counts and status rules are unchanged. `TestInsufficientBalanceKeyRemainsBackupUntilRecovery` verifies Redis reconnects, expiry, backup use, successful recovery, disabled keys, unrelated errors, and the no-Redis fallback.
