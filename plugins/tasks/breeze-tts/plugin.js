export const meta = {
  apiVersion: 1,
  key: "breeze-tts",
  name: "BreezeTTS",
  version: "1.0.0",
  author: { name: "MeowYun" },
  description: {
    en: "Speech synthesis through a self-hosted BreezeTTS API",
    zh: "通过自托管 BreezeTTS 接口合成语音",
  },
  models: ["breeze-tts"],
  fetchMode: "per_task",
  auth: "api_key",
  protocols: ["openai_audio_speech"],
};

export const protocols = {
  openai_audio_speech: {
    decodeRequest(ctx) {
      const body = ctx.body.value;
      if (ctx.body.kind !== "json" || !body || typeof body.input !== "string" || !body.input.trim()) {
        throw new Error("input is required");
      }
      const format = body.response_format ?? "wav";
      if (format !== "pcm" && format !== "wav") {
        throw new Error("response_format must be wav or pcm");
      }
      if (body.stream_format === "sse" || body.speed !== undefined && body.speed !== 1) {
        throw new Error("BreezeTTS supports audio output at its native speed");
      }
      if (body.instructions !== undefined && (typeof body.instructions !== "string" || body.instructions.length > 1024)) {
        throw new Error("instructions must be a string of at most 1024 characters");
      }
      return {
        kind: "relay",
        model: ctx.model,
        requestBody: { text: body.input, instructions: body.instructions, format },
      };
    },

    buildRequest(ctx) {
      if (!ctx.baseUrl || !ctx.apiKey || /\s/.test(ctx.apiKey)) {
        throw new Error("BreezeTTS requires a Base URL and API key");
      }
      const base = ctx.baseUrl.replace(/\/+$/, "");
      const body = { text: ctx.requestBody.text };
      if (ctx.requestBody.instructions) body.instruction = ctx.requestBody.instructions;
      return {
        url: base + (base.endsWith("/v1") ? "/audio/speech" : "/v1/audio/speech"),
        method: "POST",
        headers: { Authorization: ctx.authHeader },
        bodyEncoding: "form",
        responseType: "pcm",
        body,
      };
    },

    parseResponse(ctx) {
      return {
        format: ctx.requestBody.format,
        usage: { characters: ctx.inputCharacters },
      };
    },
  },
};
