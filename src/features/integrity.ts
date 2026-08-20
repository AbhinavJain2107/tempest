import type { RequestResult } from "../types/index.js";

export interface IntegrityReport {
  totalStreams: number;
  successfulStreams: number;
  truncatedCount: number;
  emptyTokenCount: number;
  rateLimitedCount: number;
  avgTokensPerStream: number;
  integrityScorePct: number; // 0 to 100%
  healthStatus: "EXCELLENT" | "DEGRADED" | "CRITICAL";
  warnings: string[];
}

export function evaluateOutputIntegrity(results: RequestResult[]): IntegrityReport {
  const totalStreams = results.length;
  if (totalStreams === 0) {
    return {
      totalStreams: 0,
      successfulStreams: 0,
      truncatedCount: 0,
      emptyTokenCount: 0,
      rateLimitedCount: 0,
      avgTokensPerStream: 0,
      integrityScorePct: 100,
      healthStatus: "EXCELLENT",
      warnings: [],
    };
  }

  let successfulStreams = 0;
  let truncatedCount = 0;
  let emptyTokenCount = 0;
  let rateLimitedCount = 0;
  let totalTokens = 0;
  const warnings: string[] = [];

  for (const r of results) {
    if (r.statusCode === 429) {
      rateLimitedCount++;
    }

    if (r.statusCode >= 200 && r.statusCode < 300) {
      successfulStreams++;
      totalTokens += r.tokenCount;

      if (r.tokenCount === 0 && r.bytesRead > 0) {
        emptyTokenCount++;
      }

      // If streaming response ended with very few tokens compared to prompt length, potential truncation
      if (r.promptTokens > 100 && r.tokenCount < 5) {
        truncatedCount++;
      }
    }
  }

  const avgTokensPerStream = successfulStreams > 0 ? totalTokens / successfulStreams : 0;

  // Calculate score (penalize rate limits, errors, truncations)
  let penalties = 0;
  if (totalStreams > 0) {
    const errorPct = ((totalStreams - successfulStreams) / totalStreams) * 100;
    const rateLimitPct = (rateLimitedCount / totalStreams) * 100;
    const truncatedPct = (truncatedCount / totalStreams) * 100;

    penalties = errorPct * 0.5 + rateLimitPct * 0.3 + truncatedPct * 0.2;
  }

  const integrityScorePct = Math.max(0, Math.min(100, Number((100 - penalties).toFixed(1))));

  let healthStatus: "EXCELLENT" | "DEGRADED" | "CRITICAL" = "EXCELLENT";
  if (integrityScorePct < 60 || rateLimitedCount > totalStreams * 0.15) {
    healthStatus = "CRITICAL";
  } else if (integrityScorePct < 85) {
    healthStatus = "DEGRADED";
  }

  if (rateLimitedCount > 0) {
    warnings.push(`⚠️ ${rateLimitedCount} requests throttled by provider (HTTP 429 Rate Limit)`);
  }
  if (truncatedCount > 0) {
    warnings.push(`⚠️ ${truncatedCount} streams potentially truncated prematurely under memory pressure`);
  }
  if (emptyTokenCount > 0) {
    warnings.push(`⚠️ ${emptyTokenCount} streams returned 0 tokens despite HTTP 200`);
  }

  return {
    totalStreams,
    successfulStreams,
    truncatedCount,
    emptyTokenCount,
    rateLimitedCount,
    avgTokensPerStream: Number(avgTokensPerStream.toFixed(1)),
    integrityScorePct,
    healthStatus,
    warnings,
  };
}
