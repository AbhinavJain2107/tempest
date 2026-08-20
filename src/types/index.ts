import type { CostEstimate } from "../features/cost.js";
import type { IntegrityReport } from "../features/integrity.js";

export interface EngineConfig {
  targetUrl: string;
  method?: string;
  headers?: Record<string, string>;
  concurrency: number;
  totalRequests?: number;
  durationMs?: number;
  rps?: number;
  timeoutMs?: number;
  stream: boolean;
  model?: string;
  bodyTemplate?: string;
  promptLengths?: number[];
  authHeader?: string;
  harFilePath?: string;
}

export interface RequestPayload {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  promptTokens?: number;
}

export interface RequestResult {
  startTime: number;
  endTime: number;
  durationMs: number;
  ttftMs: number; // Time to first token (ms)
  itlsMs: number[]; // Inter-token latencies (ms)
  tokenCount: number;
  statusCode: number;
  error?: string;
  bytesRead: number;
  promptTokens: number;
}

export interface PercentileStats {
  min: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
  stdDev: number;
}

export interface SummaryReport {
  timestamp: string;
  targetUrl: string;
  model?: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  errorRatePct: number;
  durationSec: number;
  rps: number;
  totalTokens: number;
  aggregateTps: number;
  avgStreamTps: number;
  statusCodes: Record<number, number>;
  latency: PercentileStats;
  ttft: PercentileStats;
  itl: PercentileStats;
  errors?: Record<string, number>;
  cost?: CostEstimate;
  integrity?: IntegrityReport;
}

export interface MetricDiff {
  name: string;
  baselineVal: number;
  currentVal: number;
  deltaVal: number;
  deltaPct: number;
  unit: string;
  breached: boolean;
}

export interface DiffReport {
  baselineFile?: string;
  passed: boolean;
  diffs: MetricDiff[];
  breaches: string[];
}
