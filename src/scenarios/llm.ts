import type { EngineConfig, RequestPayload } from "../types/index.js";

export function generateSyntheticPrompt(targetTokens: number): string {
  const safeTokens = Math.max(10, targetTokens);
  const baseSentence =
    "In high-throughput microservices, latency quantiles and token streaming throughput must be rigorously tested. ";
  const repeatCount = Math.ceil(safeTokens / 12) + 1;
  const fullText = baseSentence.repeat(repeatCount);
  const words = fullText.split(" ");
  return words.slice(0, safeTokens).join(" ");
}

export function buildOpenAIPayload(
  model: string = "llama3",
  prompt: string,
  stream: boolean = true,
  maxTokens: number = 128
): string {
  return JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    stream,
    max_tokens: maxTokens,
  });
}

export function createLLMRequestPayload(config: EngineConfig, iteration: number): RequestPayload {
  const promptLengths = config.promptLengths && config.promptLengths.length > 0
    ? config.promptLengths
    : [50, 200, 500];

  const targetTokens = promptLengths[iteration % promptLengths.length];
  const prompt = generateSyntheticPrompt(targetTokens);

  let body: string;
  if (config.bodyTemplate) {
    body = config.bodyTemplate.replace("{PROMPT}", prompt);
  } else {
    body = buildOpenAIPayload(config.model || "llama3", prompt, config.stream, 128);
  }

  const headers: Record<string, string> = { ...config.headers };
  if (config.authHeader) {
    headers["Authorization"] = config.authHeader;
  }

  return {
    url: config.targetUrl,
    method: config.method || "POST",
    headers,
    body,
    promptTokens: targetTokens,
  };
}
