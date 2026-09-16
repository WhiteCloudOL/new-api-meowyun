const COSY_MODELS = [
  "qwen-audio-3.0-tts-plus",
  "qwen-audio-3.0-tts-flash",
  "cosyvoice-v3.5-plus",
  "cosyvoice-v3.5-flash",
  "cosyvoice-v3-plus",
  "cosyvoice-v3-flash",
  "cosyvoice-v2",
];

const QWEN_MODELS = [
  "qwen3-tts-flash",
  "qwen3-tts-flash-2025-11-27",
  "qwen3-tts-flash-2025-09-18",
  "qwen3-tts-instruct-flash",
  "qwen3-tts-instruct-flash-2026-01-26",
  "qwen-tts",
  "qwen-tts-latest",
  "qwen-tts-2025-05-22",
  "qwen-tts-2025-04-10",
];

const CONFIG_KEYS = new Set([
  "sample_rate",
  "volume",
  "bit_rate",
  "pitch",
  "enable_ssml",
  "language_hints",
  "language_type",
  "seed",
  "enable_aigc_tag",
  "aigc_propagator",
  "aigc_propagate_id",
  "hot_fix",
  "enable_markdown_filter",
  "optimize_instructions",
  "allow_request_overrides",
  "max_audio_mb",
  "download_timeout_seconds",
]);

const REQUEST_OVERRIDE_KEYS = new Set([
  "sample_rate",
  "volume",
  "bit_rate",
  "pitch",
  "enable_ssml",
  "language_hints",
  "language_type",
  "seed",
  "enable_aigc_tag",
  "aigc_propagator",
  "aigc_propagate_id",
  "hot_fix",
  "enable_markdown_filter",
  "optimize_instructions",
]);

export const meta = {
  apiVersion: 1,
  key: "alibaba-tts",
  name: "阿里云 TTS 兼容",
  icon: "Bailian.Color",
  description: {
    en: "OpenAI speech compatibility for Alibaba Cloud CosyVoice and Qwen TTS",
    zh: "为阿里云 CosyVoice 与千问 TTS 提供 OpenAI 语音兼容",
  },
  version: "1.0.0",
  author: { name: "MeowYun" },
  baseUrl: "https://dashscope.aliyuncs.com",
  models: [...COSY_MODELS, ...QWEN_MODELS],
  fetchMode: "per_task",
  allowedHosts: [],
  protocols: [{ name: "openai_audio_speech" }],
  configDefaults: {
    sample_rate: 24000,
    volume: 50,
    pitch: 1.0,
    language_type: "Auto",
    enable_aigc_tag: false,
    optimize_instructions: false,
    allow_request_overrides: true,
    max_audio_mb: 32,
    download_timeout_seconds: 120,
  },
};

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkNumber(config, name, min, max, integer = false) {
  if (config[name] === undefined) return;
  const value = config[name];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail(`${name} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}`);
  }
}

function checkBoolean(config, name) {
  if (config[name] !== undefined && typeof config[name] !== "boolean") fail(`${name} must be a boolean`);
}

function checkString(config, name, maxLength = 256) {
  if (config[name] !== undefined && (typeof config[name] !== "string" || config[name].length > maxLength))
    fail(`${name} must be a string of at most ${maxLength} characters`);
}

export function validateConfig(config) {
  if (!isPlainObject(config)) fail("plugin configuration must be an object");
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key)) fail(`unknown plugin configuration field: ${key}`);
  }
  checkNumber(config, "sample_rate", 8000, 48000, true);
  if (config.sample_rate !== undefined && ![8000, 16000, 22050, 24000, 44100, 48000].includes(config.sample_rate)) fail("sample_rate is not supported");
  checkNumber(config, "volume", 0, 100, true);
  checkNumber(config, "bit_rate", 6, 510, true);
  checkNumber(config, "pitch", 0.5, 2.0);
  checkNumber(config, "seed", 0, 65535, true);
  checkNumber(config, "max_audio_mb", 1, 64, true);
  checkNumber(config, "download_timeout_seconds", 1, 300, true);
  for (const name of ["enable_ssml", "enable_aigc_tag", "enable_markdown_filter", "optimize_instructions", "allow_request_overrides"])
    checkBoolean(config, name);
  for (const name of ["language_type", "aigc_propagator", "aigc_propagate_id"]) checkString(config, name);
  if (config.language_hints !== undefined) {
    if (
      !Array.isArray(config.language_hints) ||
      config.language_hints.length < 1 ||
      config.language_hints.length > 1 ||
      typeof config.language_hints[0] !== "string"
    )
      fail("language_hints must contain exactly one language code");
  }
  if (config.hot_fix !== undefined && !isPlainObject(config.hot_fix)) fail("hot_fix must be an object");
  return true;
}

function modelFamily(model) {
  const lower = model.toLowerCase();
  if (lower.startsWith("cosyvoice-") || lower.startsWith("qwen-audio-")) return "cosy";
  if (lower.startsWith("qwen3-tts-") || lower.startsWith("qwen-tts")) return "qwen";
  fail(`unsupported Alibaba TTS model: ${model}`);
}

function normalizedBase(baseUrl) {
  return baseUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

function requestOverrides(body) {
  if (body.metadata === undefined) return {};
  if (!isPlainObject(body.metadata)) fail("metadata must be an object");
  const value = body.metadata.alibaba_tts;
  if (value === undefined) return {};
  if (!isPlainObject(value)) fail("metadata.alibaba_tts must be an object");
  for (const key of Object.keys(value)) {
    if (!REQUEST_OVERRIDE_KEYS.has(key)) fail(`unknown metadata.alibaba_tts field: ${key}`);
  }
  return value;
}

function mergeSettings(config, overrides) {
  validateConfig(config);
  if (Object.keys(overrides).length > 0 && config.allow_request_overrides === false) fail("per-request Alibaba TTS overrides are disabled");
  const merged = { ...config, ...overrides };
  validateConfig(merged);
  return merged;
}

function decodeSpeech(ctx) {
  if (!ctx.body || ctx.body.kind !== "json" || !isPlainObject(ctx.body.value)) fail("request body must be a JSON object");
  const body = ctx.body.value;
  if (typeof body.model !== "string" || body.model.trim() === "") fail("model is required");
  if (typeof body.input !== "string" || body.input.length === 0) fail("input is required");
  if (typeof body.voice !== "string" || body.voice.trim() === "") fail("voice is required");
  if (body.input.length > 20000) fail("input is too long");
  if (body.speed !== undefined && (typeof body.speed !== "number" || !Number.isFinite(body.speed) || body.speed < 0.5 || body.speed > 2.0))
    fail("speed must be between 0.5 and 2.0");
  const family = modelFamily(ctx.upstreamModel || ctx.model);
  const format = body.response_format || (family === "qwen" ? "wav" : "mp3");
  if (typeof format !== "string" || !["mp3", "pcm", "wav", "opus"].includes(format)) fail("response_format must be mp3, pcm, wav, or opus");
  if (family === "qwen" && format !== "wav") fail("Qwen TTS HTTP output is wav; set response_format to wav");
  if (body.instructions !== undefined && typeof body.instructions !== "string") fail("instructions must be a string");
  if (family === "qwen" && body.instructions && !(ctx.upstreamModel || ctx.model).toLowerCase().startsWith("qwen3-tts-instruct-flash"))
    fail("instructions require a Qwen3 TTS Instruct model");
  if (family === "qwen" && body.speed !== undefined) fail("speed is not supported by Qwen TTS HTTP models");
  return {
    kind: "relay",
    model: ctx.model,
    requestBody: {
      input: body.input,
      voice: body.voice,
      instructions: body.instructions || "",
      speed: body.speed,
      format,
      family,
      overrides: requestOverrides(body),
    },
  };
}

function buildSpeech(ctx) {
  const body = ctx.requestBody;
  if (!isPlainObject(body)) fail("normalized request body is missing");
  const settings = mergeSettings(ctx.config || {}, body.overrides || {});
  const providerModel = ctx.upstreamModel || ctx.model;
  const input = { text: body.input, voice: body.voice };
  let path;
  if (body.family === "cosy") {
    path = "/api/v1/services/audio/tts/SpeechSynthesizer";
    input.format = body.format;
    input.rate = body.speed === undefined ? 1.0 : body.speed;
    for (const key of [
      "sample_rate",
      "volume",
      "bit_rate",
      "pitch",
      "enable_ssml",
      "language_hints",
      "seed",
      "enable_aigc_tag",
      "aigc_propagator",
      "aigc_propagate_id",
      "hot_fix",
      "enable_markdown_filter",
    ]) {
      if (settings[key] !== undefined) input[key] = settings[key];
    }
    if (body.instructions) input.instruction = body.instructions;
  } else {
    path = "/api/v1/services/aigc/multimodal-generation/generation";
    input.language_type = settings.language_type || "Auto";
    if (body.instructions) input.instructions = body.instructions;
    if (body.instructions && settings.optimize_instructions !== undefined) input.optimize_instructions = settings.optimize_instructions;
  }
  return {
    url: normalizedBase(ctx.baseUrl) + path,
    method: "POST",
    headers: { Authorization: ctx.authHeader, "Content-Type": "application/json" },
    body: { model: providerModel, input },
  };
}

function parseSpeech(ctx) {
  if (!isPlainObject(ctx.body)) fail("Alibaba TTS returned a non-JSON response");
  const body = ctx.body;
  if ((body.status_code !== undefined && body.status_code !== 200) || (typeof body.code === "string" && body.code !== "")) {
    fail(typeof body.message === "string" && body.message !== "" ? body.message : "Alibaba TTS request failed");
  }
  const audio = body.output && body.output.audio;
  if (!isPlainObject(audio)) fail("Alibaba TTS response is missing audio");
  const config = ctx.config || {};
  validateConfig(config);
  const usage = isPlainObject(body.usage) ? body.usage : {};
  const inputDetails = isPlainObject(usage.input_tokens_details) ? usage.input_tokens_details : {};
  const outputDetails = isPlainObject(usage.output_tokens_details) ? usage.output_tokens_details : {};
  let format = "";
  if (typeof audio.url === "string" && audio.url !== "") {
    const match = audio.url.match(/\.([a-z0-9]+)(?:\?|$)/i);
    if (match) format = match[1].toLowerCase();
  }
  return {
    audio: { data: typeof audio.data === "string" ? audio.data : "", url: typeof audio.url === "string" ? audio.url : "" },
    format,
    requestId: typeof body.request_id === "string" ? body.request_id : "",
    allowedHostSuffixes: [".aliyuncs.com"],
    maxBytes: (config.max_audio_mb || 32) * 1024 * 1024,
    timeoutSeconds: config.download_timeout_seconds || 120,
    usage: {
      characters: usage.characters || 0,
      inputTextTokens: inputDetails.text_tokens || usage.input_tokens || 0,
      outputAudioTokens: outputDetails.audio_tokens || usage.output_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    },
  };
}

export const protocols = {
  openai_audio_speech: {
    decodeRequest: decodeSpeech,
    buildRequest: buildSpeech,
    parseResponse: parseSpeech,
  },
};
