export const meta = {
  apiVersion: 1,
  key: "breeze-tts",
  name: "BreezeTTS",
  version: "2.0.0",
  author: { name: "MeowYun" },
  description: {
    en: "GGUF speech synthesis through Breeze-TTS-2.cpp",
    zh: "通过 Breeze-TTS-2.cpp 合成 GGUF 模型语音",
  },
  models: ["breeze-tts-2"],
  fetchMode: "per_task",
  auth: "api_key",
  protocols: ["openai_audio_speech"],
};

export const protocols = {
  openai_audio_speech: {
    decodeRequest(ctx) {
      const body = ctx.body.value;
      if (ctx.operation !== "create") throw new Error("Breeze-TTS-2.cpp does not support batch synthesis");
      if (ctx.body.kind !== "json" || !body || typeof body.input !== "string" || !body.input.trim()) {
        throw new Error("input is required");
      }
      const native = body.breeze_native_pcm === true;
      const format = native ? "pcm" : body.response_format ?? "mp3";
      if (!["mp3", "wav", "pcm", "opus", "aac", "flac"].includes(format)) {
        throw new Error("response_format must be mp3, wav, pcm, opus, aac or flac");
      }
      const stream = body.stream_format ?? "audio";
      if (stream !== "audio" && stream !== "sse") throw new Error("stream_format must be audio or sse");
      const fields = native ? { text: body.input } : { input: body.input, model: ctx.upstreamModel || ctx.model, response_format: format, stream_format: stream };
      const instruction = native ? body.instruction : body.instructions;
      if (instruction !== undefined && instruction !== null) {
        if (typeof instruction !== "string") throw new Error("instructions must be a string");
        fields[native ? "instruction" : "instructions"] = instruction;
      }
      // Zero means the GGUF model's default. Preserve it, including in forms.
      const limits = {
        cfg_scale: [0, 20], seed: [-2147483648, 2147483647, true],
        temperature: [0, 10], top_k: [0, 10000, true], top_p: [0, 1],
        repetition_penalty: [0, 100], split_chars: [0, 4096, true],
        max_new_tokens: [0, 1500, true],
      };
      for (const name of Object.keys(limits)) {
        if (body[name] === undefined || body[name] === null) continue;
        const raw = body[name];
        const value = typeof raw === "string" && raw.trim() ? Number(raw) : raw;
        const [lo, hi, integer] = limits[name];
        if (typeof value !== "number" || !Number.isFinite(value) || value < lo || value > hi || (integer && !Number.isInteger(value))) {
          throw new Error(name + " is out of range");
        }
        fields[name] = native ? String(value) : value;
      }
      if (native) {
        for (const name of ["voice_id", "ref_text"]) {
          if (body[name] === undefined) continue;
          if (typeof body[name] !== "string") throw new Error(name + " must be a string");
          fields[name] = body[name];
        }
        if (body.ref_audio !== undefined && (typeof body.ref_audio !== "string" || !body.ref_text?.trim())) {
          throw new Error("ref_audio requires ref_text");
        }
      } else if (body.voice !== undefined && body.voice !== null) {
        const voice = body.voice;
        if (typeof voice !== "string" && (!voice || typeof voice !== "object" || Array.isArray(voice) || typeof voice.id !== "string")) {
          throw new Error("voice must be a string or an object with an id");
        }
        fields.voice = voice;
      }
      return {
        kind: "relay", model: ctx.model,
        requestBody: { fields, format, native, sse: !native && stream === "sse", referenceAudio: native ? body.ref_audio : undefined, referenceFilename: body.ref_audio_filename },
      };
    },

    buildRequest(ctx) {
      if (!ctx.baseUrl || !ctx.apiKey || /[^!-~]/.test(ctx.apiKey)) {
        throw new Error("BreezeTTS requires a Base URL and API key");
      }
      const base = ctx.baseUrl.replace(/\/+$/, "");
      const request = ctx.requestBody;
      return {
        url: base + (base.endsWith("/v1") ? "" : "/v1") + "/audio/speech",
        method: "POST", headers: { Authorization: ctx.authHeader },
        bodyEncoding: request.native ? request.referenceAudio ? "multipart" : "form" : "json",
        responseType: request.sse ? "sse" : request.native ? "pcm_stream" : "audio_stream",
        body: request.fields, referenceAudio: request.referenceAudio, referenceFilename: request.referenceFilename,
      };
    },

    parseResponse(ctx) {
      return {
        done: ctx.requestBody.sse && ctx.body?.type === "speech.audio.done",
        format: ctx.requestBody.format,
        // Upstream SSE token counts are always zero; billing uses submitted text.
        usage: { characters: ctx.inputCharacters },
      };
    },
  },
};
