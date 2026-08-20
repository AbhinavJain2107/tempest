import { describe, expect, it } from "vitest";
import { calculateCostEstimate } from "../src/features/cost.js";
import { evaluateOutputIntegrity } from "../src/features/integrity.js";
import type { RequestResult } from "../src/types/index.js";

describe("Tempest Unique Features Test Suite", () => {
  it("should calculate accurate AI cost and monthly projections", () => {
    // 100,000 prompt tokens and 50,000 completion tokens on GPT-4o over 10 seconds
    const estimate = calculateCostEstimate("gpt-4o", 100_000, 50_000, 10);

    expect(estimate.modelName).toBe("GPT-4o");
    expect(estimate.runCostUSD).toBeGreaterThan(0);
    expect(estimate.projectedMonthlyUSD).toBeGreaterThan(0);
    expect(estimate.gpuRecommendation).toBeDefined();
  });

  it("should evaluate AI output integrity and detect degradation", () => {
    const mockResults: RequestResult[] = [
      {
        startTime: 0,
        endTime: 100,
        durationMs: 100,
        ttftMs: 20,
        itlsMs: [5, 5],
        tokenCount: 25,
        statusCode: 200,
        bytesRead: 100,
        promptTokens: 50,
      },
      {
        startTime: 0,
        endTime: 100,
        durationMs: 100,
        ttftMs: 0,
        itlsMs: [],
        tokenCount: 0,
        statusCode: 429, // Rate limited
        bytesRead: 0,
        promptTokens: 50,
      },
    ];

    const integrity = evaluateOutputIntegrity(mockResults);
    expect(integrity.totalStreams).toBe(2);
    expect(integrity.rateLimitedCount).toBe(1);
    expect(integrity.integrityScorePct).toBeLessThan(100);
    expect(integrity.warnings.length).toBeGreaterThan(0);
  });
});
