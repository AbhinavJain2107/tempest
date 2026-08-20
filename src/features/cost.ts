export interface ModelPricing {
  name: string;
  promptCostPer1M: number;
  completionCostPer1M: number;
  provider: string;
}

export const KNOWN_MODELS: Record<string, ModelPricing> = {
  "gpt-4o": { name: "GPT-4o", promptCostPer1M: 2.5, completionCostPer1M: 10.0, provider: "OpenAI" },
  "gpt-4o-mini": { name: "GPT-4o-mini", promptCostPer1M: 0.15, completionCostPer1M: 0.6, provider: "OpenAI" },
  "claude-3-5-sonnet": { name: "Claude 3.5 Sonnet", promptCostPer1M: 3.0, completionCostPer1M: 15.0, provider: "Anthropic" },
  "claude-3-haiku": { name: "Claude 3 Haiku", promptCostPer1M: 0.25, completionCostPer1M: 1.25, provider: "Anthropic" },
  "llama3-70b": { name: "Llama 3 70B", promptCostPer1M: 0.59, completionCostPer1M: 0.79, provider: "Groq / Together" },
  "llama3-8b": { name: "Llama 3 8B", promptCostPer1M: 0.05, completionCostPer1M: 0.08, provider: "Groq" },
  "llama3": { name: "Llama 3 (Local)", promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: "Ollama (Local $0)" },
  "default": { name: "Standard AI Model", promptCostPer1M: 1.0, completionCostPer1M: 3.0, provider: "Custom" },
};

export interface CostEstimate {
  modelName: string;
  provider: string;
  totalTokens: number;
  runCostUSD: number;
  projectedHourlyUSD: number;
  projectedMonthlyUSD: number;
  alternativeSavingsUSD?: number;
  gpuRecommendation?: string;
}

export function calculateCostEstimate(
  modelKey: string,
  totalPromptTokens: number,
  totalCompletionTokens: number,
  durationSec: number
): CostEstimate {
  const model = KNOWN_MODELS[modelKey.toLowerCase()] || KNOWN_MODELS["default"];

  const promptCost = (totalPromptTokens / 1_000_000) * model.promptCostPer1M;
  const completionCost = (totalCompletionTokens / 1_000_000) * model.completionCostPer1M;
  const runCost = promptCost + completionCost;

  const costPerSec = durationSec > 0 ? runCost / durationSec : 0;
  const projectedHourly = costPerSec * 3600;
  const projectedMonthly = projectedHourly * 24 * 30;

  let gpuRecommendation = "1x NVIDIA L4 (24GB) or local Mac M-series";
  if (totalCompletionTokens > 5000 || durationSec > 30) {
    gpuRecommendation = "2x NVIDIA A10G (48GB) or 1x A100 (80GB)";
  }

  // Cost comparison with cheaper model (e.g. gpt-4o-mini)
  const miniModel = KNOWN_MODELS["gpt-4o-mini"];
  const miniRunCost =
    (totalPromptTokens / 1_000_000) * miniModel.promptCostPer1M +
    (totalCompletionTokens / 1_000_000) * miniModel.completionCostPer1M;
  const savings = Math.max(0, runCost - miniRunCost);

  return {
    modelName: model.name,
    provider: model.provider,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    runCostUSD: Number(runCost.toFixed(4)),
    projectedHourlyUSD: Number(projectedHourly.toFixed(2)),
    projectedMonthlyUSD: Number(projectedMonthly.toFixed(2)),
    alternativeSavingsUSD: Number(savings.toFixed(4)),
    gpuRecommendation,
  };
}
