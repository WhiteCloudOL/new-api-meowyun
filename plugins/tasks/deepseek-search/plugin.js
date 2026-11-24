export const meta = {
  apiVersion: 1,
  key: "deepseek-search",
  name: "DeepSeek Search & Fetch",
  version: "1.0.0",
  author: { name: "MeowYun" },
  description: {
    en: "Web search and page fetching through the DeepSeek API",
    zh: "通过 DeepSeek API 搜索网页和抓取正文",
  },
  baseUrl: "https://api.deepseek.com",
  models: ["deepseek-search", "deepseek-fetch"],
  relay: [
    { incoming_path: "/v1/tools/search", upstream_path: "/v1/tools/search", models: ["deepseek-search"] },
    { incoming_path: "/v1/tools/fetch", upstream_path: "/v1/tools/fetch", models: ["deepseek-fetch"] },
  ],
};
