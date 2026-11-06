const COSY_MODELS = [
  "qwen-audio-3.1-tts-plus",
  "qwen-audio-3.1-tts-flash",
  "qwen-audio-3.0-tts-plus",
  "qwen-audio-3.0-tts-flash",
  "cosyvoice-v3.5-plus",
  "cosyvoice-v3.5-flash",
  "cosyvoice-v3-plus",
  "cosyvoice-v3-flash",
  "cosyvoice-v2",
];

const NEXT_MODEL = "qwen-audio-3.1-tts-next";
const VOICE_MODELS = ["voice-enrollment"];
const REALTIME_MODELS = ["qwen3-tts-flash-realtime", "qwen3-tts-flash-realtime-2025-11-27", "qwen3-tts-flash-realtime-2025-09-18", "qwen3-tts-instruct-flash-realtime", "qwen3-tts-instruct-flash-realtime-2026-01-22"];
const SPEECH_PATH = "/api/v1/services/audio/tts/SpeechSynthesizer";
const GENERATION_PATH = "/api/v1/services/aigc/multimodal-generation/generation";
const CUSTOMIZATION_PATH = "/api/v1/services/audio/tts/customization";

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
  "word_timestamp_enabled",
  "channels",
  "references",
  "enable_cbr",
  "quality",
  "allow_request_overrides",
  "max_audio_mb",
  "download_timeout_seconds",
  "qwen_base_url",
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
  "word_timestamp_enabled",
  "channels",
  "references",
  "enable_cbr",
  "quality",
]);

export const meta = {
  apiVersion: 1,
  key: "alibaba-tts",
  name: "阿里云 TTS 兼容",
  icon: "Bailian.Color",
  description: {
    en: "Alibaba Cloud speech synthesis, realtime audio and voice customization",
    zh: "阿里云语音合成、实时音频与音色定制",
  },
  version: "1.1.0",
  author: { name: "MeowYun" },
  baseUrl: "https://dashscope.aliyuncs.com",
  models: [...COSY_MODELS, ...QWEN_MODELS, ...REALTIME_MODELS, NEXT_MODEL, ...VOICE_MODELS],
  fetchMode: "per_task",
  allowedHosts: ["dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com"],
  protocols: [{ name: "openai_audio_speech", models: [...COSY_MODELS, ...QWEN_MODELS, NEXT_MODEL] }],
  routes: [
    { method: "POST", path: SPEECH_PATH, type: "relay", protocol: "openai_audio_speech", models: [...COSY_MODELS, NEXT_MODEL], decode: "speech", render: "response" },
    { method: "POST", path: GENERATION_PATH, type: "relay", protocol: "openai_audio_speech", models: QWEN_MODELS, decode: "speech", render: "response" },
    { method: "POST", path: CUSTOMIZATION_PATH, type: "relay", protocol: "openai_audio_speech", models: VOICE_MODELS, decode: "customization", render: "response" },
  ],
  usageProfiles: [
    { models: ["qwen-audio-3.1-tts-flash", NEXT_MODEL], schema: {
      input_tokens: { type: "number", unit: "token", description: { en: "Text input unit price", zh: "文本输入单价" } },
      output_tokens: { type: "number", unit: "token", description: { en: "Audio output unit price", zh: "音频输出单价" } },
    }, examples: [{ label: "Speech synthesis", facts: { input_tokens: 100, output_tokens: 1000 } }] },
    { models: VOICE_MODELS, schema: {
      requests: { type: "number", unit: "count", description: { en: "Voice customization unit price", zh: "音色定制单价" } },
      action: { enum: ["create_voice", "list_voice", "query_voice", "update_voice", "delete_voice"], description: { en: "Voice operation", zh: "音色操作" } },
    } },
  ],
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
    qwen_base_url: "",
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
  if (config.sample_rate !== undefined && ![8000, 12000, 16000, 22050, 24000, 44100, 48000].includes(config.sample_rate)) fail("sample_rate is not supported");
  checkNumber(config, "volume", 0, 100, true);
  checkNumber(config, "bit_rate", 6, 510, true);
  checkNumber(config, "pitch", 0.5, 2.0);
  checkNumber(config, "seed", 0, 65535, true);
  checkNumber(config, "max_audio_mb", 1, 64, true);
  checkNumber(config, "download_timeout_seconds", 1, 300, true);
  checkNumber(config, "channels", 1, 2, true);
  checkNumber(config, "quality", 0, 9, true);
  for (const name of ["enable_ssml", "enable_aigc_tag", "enable_markdown_filter", "optimize_instructions", "allow_request_overrides", "word_timestamp_enabled", "enable_cbr"])
    checkBoolean(config, name);
  for (const name of ["language_type", "aigc_propagator", "aigc_propagate_id"]) checkString(config, name);
  checkString(config, "qwen_base_url", 191);
  if (config.qwen_base_url && !/^https:\/\/(?:(?:dashscope|dashscope-intl)\.aliyuncs\.com|[a-zA-Z0-9-]+\.(?:cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com)(?:\/api\/v1)?\/?$/.test(config.qwen_base_url))
    fail("qwen_base_url must be an official Alibaba Cloud Model Studio HTTP base URL");
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
  if (config.references !== undefined) validateReferences(config.references);
  return true;
}

function modelFamily(model) {
  const lower = model.toLowerCase();
  if (lower === NEXT_MODEL) return "next";
  if (VOICE_MODELS.includes(lower)) return "voice";
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
  const family = modelFamily(ctx.upstreamModel || ctx.model);
  if (family !== "next" && (typeof body.voice !== "string" || body.voice.trim() === "")) fail("voice is required");
  if (body.input.length > 20000) fail("input is too long");
  if (body.speed !== undefined && (typeof body.speed !== "number" || !Number.isFinite(body.speed) || body.speed < 0.5 || body.speed > 2.0))
    fail("speed must be between 0.5 and 2.0");
  const format = body.response_format || (family === "qwen" || family === "next" ? "wav" : "mp3");
  if (typeof format !== "string" || !["mp3", "pcm", "wav", "opus"].includes(format)) fail("response_format must be mp3, pcm, wav, or opus");
  if (family === "qwen" && format !== "wav") fail("Qwen TTS HTTP output is wav; set response_format to wav");
  if (body.instructions !== undefined && typeof body.instructions !== "string") fail("instructions must be a string");
  if (family === "qwen" && body.instructions && !(ctx.upstreamModel || ctx.model).toLowerCase().startsWith("qwen3-tts-instruct-flash"))
    fail("instructions require a Qwen3 TTS Instruct model");
  if (family === "qwen" && body.speed !== undefined) fail("speed is not supported by Qwen TTS HTTP models");
  if (family === "next" && format === "opus") fail("Qwen Audio Next does not support Opus output");
  if (family === "next" && [...body.input].length > 3000) fail("text_prompt exceeds 3000 characters");
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
      providerModel: ctx.upstreamModel || ctx.model,
      overrides: requestOverrides(body),
    },
  };
}

function buildSpeech(ctx) {
  const body = ctx.requestBody;
  if (!isPlainObject(body)) fail("normalized request body is missing");
  const settings = mergeSettings(ctx.config || {}, body.overrides || {});
  if (body.native) return buildNative(ctx, body, settings);
  const providerModel = ctx.upstreamModel || ctx.model;
  checkVoiceScope(body.voice, ctx.userScope);
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
  } else if (body.family === "next") {
    path = SPEECH_PATH;
    delete input.voice;
    delete input.text;
    input.text_prompt = body.input;
    input.format = body.format;
    for (const key of ["sample_rate", "channels", "references", "volume", "enable_cbr", "bit_rate", "quality", "seed", "enable_aigc_tag"]) {
      if (settings[key] !== undefined) input[key] = settings[key];
    }
    if (body.speed !== undefined) input.rate = body.speed;
    if (input.sample_rate !== undefined && ![8000, 16000, 24000, 44100, 48000].includes(input.sample_rate)) fail("sample_rate is not supported by Qwen Audio Next");
  } else {
    path = "/api/v1/services/aigc/multimodal-generation/generation";
    input.language_type = settings.language_type || "Auto";
    if (body.instructions) input.instructions = body.instructions;
    if (body.instructions && settings.optimize_instructions !== undefined) input.optimize_instructions = settings.optimize_instructions;
  }
  const baseUrl = body.family === "qwen" ? qwenBase(ctx, settings) : ctx.baseUrl;
  return {
    url: normalizedBase(baseUrl) + path,
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
  const audio = body.output && body.output.audio || {};
  if (!body.output || (!audio.url && !audio.data && !(ctx.requestBody && (ctx.requestBody.family === "voice" || ctx.requestBody.sse)))) fail("Alibaba TTS response is missing audio");
  const config = ctx.config || {};
  validateConfig(config);
  const usage = isPlainObject(body.usage) ? body.usage : {};
  const inputDetails = isPlainObject(usage.input_tokens_details) ? usage.input_tokens_details : {};
  const outputDetails = isPlainObject(usage.output_tokens_details) ? usage.output_tokens_details : {};
  const model = ctx.requestBody && ctx.requestBody.providerModel;
  if (ctx.requestBody && ctx.requestBody.family === "voice") {
    return { done: true, usage: { facts: { requests: usage.count, action: ctx.requestBody.body.input.action } } };
  }
  let format = "";
  if (typeof audio.url === "string" && audio.url !== "") {
    const match = audio.url.match(/\.([a-z0-9]+)(?:\?|$)/i);
    if (match) format = match[1].toLowerCase();
  }
  return {
    done: body.output.finish_reason === "stop",
    audio: { data: typeof audio.data === "string" ? audio.data : "", url: typeof audio.url === "string" ? audio.url : "" },
    format,
    requestId: typeof body.request_id === "string" ? body.request_id : "",
    allowedHostSuffixes: [".aliyuncs.com"],
    maxBytes: (config.max_audio_mb || 32) * 1024 * 1024,
    timeoutSeconds: config.download_timeout_seconds || 120,
    usage: {
      characters: model === "qwen-audio-3.1-tts-flash" ? 0 : (usage.characters ?? 0),
      inputTextTokens: usage.characters !== undefined && model !== "qwen-audio-3.1-tts-flash" ? 0 : (inputDetails.text_tokens ?? usage.input_tokens ?? 0),
      outputAudioTokens: usage.characters !== undefined && model !== "qwen-audio-3.1-tts-flash" ? 0 : (outputDetails.audio_tokens ?? usage.output_tokens ?? 0),
      totalTokens: usage.characters !== undefined && model !== "qwen-audio-3.1-tts-flash" ? 0 : (usage.total_tokens ?? 0),
      facts: model === NEXT_MODEL || model === "qwen-audio-3.1-tts-flash" ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens } : undefined,
    },
  };
}

export const protocols = {
  openai_audio_speech: {
    decodeRequest: decodeSpeech,
    buildRequest: buildSpeech,
    parseResponse: parseSpeech,
    estimateUsage(ctx) {
      const body = ctx.requestBody;
      // Next can tokenize reference audio as input; reserve the bounded host
      // fallback for both sides rather than inferring tokens from duration.
      if (body.family === "next") return { input_tokens: ctx.fallbackOutputTokens, output_tokens: ctx.fallbackOutputTokens };
      if (body.family === "voice") return { requests: 1, action: body.body.input.action };
      return { input_tokens: ctx.inputBytes, output_tokens: ctx.fallbackOutputTokens };
    },
  },
};

function qwenBase(ctx, settings) {
  return settings.qwen_base_url || ctx.baseUrl;
}

function validateReferences(references) {
  if (!Array.isArray(references) || references.length > 3) fail("references must contain at most three audio clips");
  for (const reference of references) {
    if (!isPlainObject(reference) || Boolean(reference.audio_url) === Boolean(reference.audio_data)) fail("provide exactly one of audio_url and audio_data");
    const audio = reference.audio_url || reference.audio_data;
    if (typeof audio !== "string") fail("reference audio must be a string");
    if (reference.audio_data) validateAudioDataURI(audio, /^data:audio\/(?:wav|mpeg|ogg);base64,/);
    if (reference.audio_url && !/^https?:\/\//.test(audio)) fail("reference audio URL must use HTTP or HTTPS");
  }
}

function validateAudioDataURI(audio, mimePattern) {
  if (!mimePattern.test(audio) || audio.length > 14 * 1024 * 1024) fail("unsupported audio data URI");
  const data = audio.slice(audio.indexOf(",") + 1);
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  if (data.length % 4 !== 0 || data.length / 4 * 3 - padding > 10 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) fail("audio must contain valid Base64 data of at most 10 MiB");
}

function readNative(ctx, customization = false) {
  if (!ctx.body || ctx.body.kind !== "json" || !isPlainObject(ctx.body.value)) fail("request body must be a JSON object");
  const body = ctx.body.value;
  const model = ctx.model || body.model;
  const providerModel = ctx.upstreamModel || body.model;
  if (typeof providerModel !== "string" || !isPlainObject(body.input)) fail("model and input are required");
  const family = modelFamily(providerModel);
  if (customization !== (family === "voice")) fail("model is not supported by this endpoint");
  const input = body.input;
  let text = "";
  if (customization) {
    if (!["create_voice", "list_voice", "query_voice", "update_voice", "delete_voice"].includes(input.action)) fail("unsupported voice operation");
    if (input.action === "create_voice") {
      if (!COSY_MODELS.includes(input.target_model)) fail("target_model must be a supported Qwen Audio or CosyVoice model");
      if (typeof input.prefix !== "string" || !/^[a-zA-Z0-9]{1,10}$/.test(input.prefix)) fail("prefix must contain 1 to 10 letters or digits");
      if (input.voice_prompt !== undefined) {
        if (typeof input.voice_prompt !== "string" || !input.voice_prompt.trim() || [...input.voice_prompt].length > 500 || typeof input.preview_text !== "string" || [...input.preview_text].length < 15 || [...input.preview_text].length > 200) fail("voice design requires a prompt of at most 500 characters and a preview of 15 to 200 characters");
      } else validateVoiceAudio(input.audio ?? input.url);
    } else if (input.action === "update_voice") {
      validateVoiceAudio(input.audio ?? input.url);
    }
    if (["query_voice", "update_voice", "delete_voice"].includes(input.action) && (typeof input.voice_id !== "string" || !input.voice_id)) fail("voice_id is required");
    if (input.page_size !== undefined && (!Number.isInteger(input.page_size) || input.page_size < 1 || input.page_size > 100)) fail("page_size must be between 1 and 100");
    if (input.page_index !== undefined && (!Number.isSafeInteger(input.page_index) || input.page_index < 0)) fail("page_index must be a non-negative integer");
  } else {
    text = family === "next" ? input.text_prompt : input.text;
    if (typeof text !== "string" || !text.trim() || [...text].length > (family === "next" ? 3000 : 20000)) fail("invalid speech text length");
    if (family !== "next" && (typeof input.voice !== "string" || !input.voice)) fail("voice is required");
    if (family === "next" && input.voice !== undefined) fail("Qwen Audio Next uses references instead of voice IDs");
    if (input.format !== undefined && !["mp3", "wav", "pcm", ...(family === "next" ? [] : ["opus"])].includes(input.format)) fail("unsupported audio format");
    if (family === "qwen" && input.format !== undefined && input.format !== "wav") fail("Qwen TTS HTTP output is wav");
    checkNumber(input, "rate", 0.5, 2);
    checkNumber(input, "sample_rate", 8000, 48000, true);
    if (input.sample_rate !== undefined && !(family === "next" ? [8000, 16000, 24000, 44100, 48000] : [8000, 12000, 16000, 22050, 24000, 44100, 48000]).includes(input.sample_rate)) fail("sample_rate is not supported");
    checkNumber(input, "volume", 0, 100, true);
    checkNumber(input, "pitch", 0.5, 2);
    checkNumber(input, "channels", 1, 2, true);
    if (input.references !== undefined) validateReferences(input.references);
  }
  const sse = Object.entries(ctx.requestHeaders || {}).some(([name, value]) => name.toLowerCase() === "x-dashscope-sse" && value.toLowerCase() === "enable");
  if (sse && (customization || family === "next")) fail("this operation does not support SSE");
  return {
    kind: "relay", model,
    targetModel: customization ? input.target_model : undefined,
    request: { model, input: text, voice: input.voice || "", response_format: input.format || "wav" },
    requestBody: { native: true, body, family, providerModel, sse, format: input.format || "wav", scope: ctx.userScope },
  };
}

function validateVoiceAudio(audio) {
  if (typeof audio !== "string" || !audio || audio.length > 14 * 1024 * 1024 || !/^(?:https?:\/\/|data:audio\/(?:wav|mpeg|mp4);base64,)/.test(audio)) fail("audio must be an HTTP URL or a WAV, MP3 or M4A data URI of at most 10 MiB");
  if (audio.startsWith("data:")) validateAudioDataURI(audio, /^data:audio\/(?:wav|mpeg|mp4);base64,/);
}

function checkVoiceScope(voice, scope) {
  const match = typeof voice === "string" && voice.match(/-(u[0-9a-z]{1,9})-/);
  if (match && match[1] !== scope) fail("voice belongs to another gateway user");
}

function socketUsage(usage) {
  if (!isPlainObject(usage)) return undefined;
  const measured = {};
  for (const key of ["characters", "input_tokens", "output_tokens"]) {
    if (usage[key] !== undefined) measured[key] = usage[key];
  }
  return measured;
}

function buildNative(ctx, request, settings) {
  const body = { ...request.body, model: ctx.upstreamModel || ctx.model, input: { ...request.body.input } };
  const input = body.input;
  let path = request.family === "qwen" ? GENERATION_PATH : SPEECH_PATH;
  if (request.family === "voice") {
    path = CUSTOMIZATION_PATH;
    const prefix = ctx.userScope;
    if (typeof prefix !== "string" || !/^u[0-9a-z]{1,9}$/.test(prefix)) fail("gateway voice ownership context is missing");
    if (input.action === "create_voice" || input.action === "list_voice") input.prefix = prefix;
    else if (!input.voice_id.includes("-" + prefix + "-")) fail("voice belongs to another gateway user");
  } else {
    checkVoiceScope(input.voice, ctx.userScope);
  }
  const headers = { Authorization: ctx.authHeader, "Content-Type": "application/json" };
  if (request.sse) headers["X-DashScope-SSE"] = "enable";
  return { url: normalizedBase(request.family === "qwen" ? qwenBase(ctx, settings) : ctx.baseUrl) + path,
    method: "POST", headers, body, responseType: request.sse ? "sse" : "json" };
}

export const native = {
  speech: (ctx) => readNative(ctx),
  customization: (ctx) => readNative(ctx, true),
  response(ctx, response) {
    if (ctx.requestBody.family === "voice" && ctx.requestBody.body.input.action === "list_voice" && response.output && Array.isArray(response.output.voice_list)) {
      return { ...response, output: { ...response.output, voice_list: response.output.voice_list.filter(voice => typeof voice.voice_id === "string" && voice.voice_id.includes("-" + ctx.userScope + "-")) } };
    }
    return response;
  },
  socketStart(ctx) {
    const event = ctx.event;
    const realtime = Boolean(ctx.queryModel);
    const model = ctx.upstreamModel || (realtime ? ctx.queryModel : event.payload && event.payload.model);
    if (!(realtime ? REALTIME_MODELS : COSY_MODELS).includes(model)) fail("unsupported realtime speech model");
    if (realtime) {
      if (event.type !== "session.update" || !isPlainObject(event.session)) fail("send session.update before audio synthesis");
      if (typeof event.session.voice !== "string" || !event.session.voice) fail("session.voice is required");
    } else if (!event.header || event.header.action !== "run-task" || typeof event.header.task_id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(event.header.task_id) || !event.payload || event.payload.task !== "tts" || event.payload.task_group !== "audio" || event.payload.function !== "SpeechSynthesizer" || !isPlainObject(event.payload.parameters) || !isPlainObject(event.payload.input) || Object.keys(event.payload.input).length !== 0) {
      fail("expected an audio SpeechSynthesizer run-task event with empty input");
    }
    const parameters = realtime ? event.session : event.payload.parameters;
    if (typeof parameters.voice !== "string" || !parameters.voice) fail("voice is required");
    checkNumber(parameters, "rate", 0.5, 2);
    checkNumber(parameters, "sample_rate", 8000, 48000, true);
    checkNumber(parameters, "volume", 0, 100, true);
    checkNumber(parameters, "pitch", 0.5, 2);
    return { model: ctx.model || model, realtime, taskId: realtime ? "" : event.header.task_id, event, family: modelFamily(model), providerModel: model };
  },
  socketRequest(ctx) {
    const request = ctx.requestBody;
    const event = JSON.parse(JSON.stringify(request.event));
    const parameters = request.realtime ? event.session : event.payload.parameters;
    checkVoiceScope(parameters.voice, ctx.userScope);
    if (!request.realtime) event.payload.model = ctx.upstreamModel || ctx.model;
    const path = request.realtime ? "/api-ws/v1/realtime?model=" + encodeURIComponent(ctx.upstreamModel || ctx.model) : "/api-ws/v1/inference";
    return { url: normalizedBase(ctx.baseUrl) + path, method: "GET", headers: { Authorization: ctx.authHeader }, body: event };
  },
  socketClient(ctx) {
    const event = ctx.event;
    const request = ctx.requestBody;
    if (request.realtime) {
      if (event.type === "session.update") {
        if (!isPlainObject(event.session) || event.session.model !== undefined && event.session.model !== request.model) fail("the speech model is fixed for this session");
        checkVoiceScope(event.session.voice, ctx.userScope);
        return {};
      }
      if (event.type === "input_text_buffer.append") {
        if (typeof event.text !== "string" || !event.text) fail("text is required");
        return { text: event.text };
      }
      if (!["input_text_buffer.commit", "input_text_buffer.clear", "session.finish"].includes(event.type)) fail("unsupported speech session event");
      return {};
    }
    if (!event.header || event.header.task_id !== request.taskId) fail("speech events must use the active task_id");
    if (event.header.action === "continue-task") {
      if (!event.payload || !isPlainObject(event.payload.input) || typeof event.payload.input.text !== "string" || !event.payload.input.text) fail("payload.input.text is required");
      return { text: event.payload.input.text };
    }
    if (event.header.action !== "finish-task" || !event.payload || !isPlainObject(event.payload.input) || Object.keys(event.payload.input).length !== 0) fail("expected finish-task with empty input");
    return {};
  },
  socketServer(ctx) {
    const event = ctx.event;
    const request = ctx.requestBody;
    if (request.realtime) {
      if (event.type === "response.done" && (!isPlainObject(event.response) || typeof event.response.id !== "string" || !event.response.id || !isPlainObject(event.response.usage))) fail("speech response is missing its usage or response ID");
      return { done: event.type === "session.finished", failed: event.type === "error", audio: event.type === "response.audio.delta",
        usage: event.type === "response.done" && event.response ? socketUsage(event.response.usage) : undefined,
        cumulative: false, usageId: event.type === "response.done" && event.response ? event.response.id : undefined };
    }
    if (!event.header || event.header.task_id !== request.taskId) fail("upstream returned an unexpected speech task_id");
    return { done: event.header.event === "task-finished", failed: event.header.event === "task-failed", cumulative: true,
      usage: socketUsage(event.payload && event.payload.usage) };
  },
};
