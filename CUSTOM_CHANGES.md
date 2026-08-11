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
