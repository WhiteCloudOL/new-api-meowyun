# Meowyun custom changes

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
