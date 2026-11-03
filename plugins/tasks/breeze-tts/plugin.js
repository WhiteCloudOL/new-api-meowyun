export const meta = {
  apiVersion: 1,
  key: "breeze-tts",
  name: "BreezeTTS",
  version: "1.1.0",
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
      const batch = ctx.operation === "batch";
      const format = batch ? "pcm" : body.response_format ?? "wav";
      if (format !== "pcm" && format !== "wav") {
        throw new Error("response_format must be wav or pcm");
      }
      const fields = batch ? { texts: JSON.stringify(body.texts) } : { text: body.input };
      const instruction = body.instruction ?? body.instructions;
      if (instruction !== undefined) {
        if (typeof instruction !== "string") throw new Error("instruction must be a string");
        if (instruction.trim()) fields.instruction = instruction;
      }
      for (const name of ["cfg_scale", "seed", ...(batch ? ["max_new_tokens"] : [])]) {
        if (body[name] === undefined) continue;
        const raw = body[name];
        const value = typeof raw === "string" && raw.trim() ? Number(raw) : raw;
        if (typeof value !== "number" || !Number.isFinite(value) ||
            (name === "cfg_scale" && value <= 0) ||
            (name === "seed" && (!Number.isInteger(value) || value < 0 || value > 4294967295)) ||
            (name === "max_new_tokens" && !Number.isSafeInteger(value))) {
          throw new Error(name + " is out of range");
        }
        fields[name] = String(name === "max_new_tokens" ? Math.max(1, Math.min(1500, value)) : value);
      }
      if (body.ref_text !== undefined && typeof body.ref_text !== "string") {
        throw new Error("ref_text must be a string");
      }
      if (Boolean(body.ref_audio) !== Boolean(body.ref_text?.trim()) ||
          (body.ref_audio !== undefined && typeof body.ref_audio !== "string")) {
        throw new Error("ref_audio and ref_text must be provided together");
      }
      if (body.ref_audio) fields.ref_text = body.ref_text;
      return {
        kind: "relay",
        model: ctx.model,
        requestBody: {
          fields, format, batch, streaming: !batch && format === "pcm" && body.breeze_native_pcm === true,
          referenceAudio: body.ref_audio,
          referenceFilename: body.ref_audio_filename,
        },
      };
    },

    buildRequest(ctx) {
      if (!ctx.baseUrl || !ctx.apiKey || /[^!-~]/.test(ctx.apiKey)) {
        throw new Error("BreezeTTS requires a Base URL and API key");
      }
      const base = ctx.baseUrl.replace(/\/+$/, "");
      const request = ctx.requestBody;
      return {
        url: base + (base.endsWith("/v1") ? "" : "/v1") + "/audio/speech" + (request.batch ? "/batch" : ""),
        method: "POST",
        headers: { Authorization: ctx.authHeader },
        bodyEncoding: request.referenceAudio ? "multipart" : "form",
        responseType: request.batch ? "pcm_batch" : request.streaming ? "pcm_stream" : "pcm",
        body: request.fields,
        referenceAudio: request.referenceAudio,
        referenceFilename: request.referenceFilename,
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
