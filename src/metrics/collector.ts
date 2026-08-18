import chalk from "chalk";
import type { PercentileStats, RequestResult, SummaryReport } from "../types/index.js";

export class MetricsCollector {
  private targetUrl: string;
  private startTime: number;
  private results: RequestResult[] = [];
  private statusCodes: Record<number, number> = {};
  private errorCounts: Record<string, number> = {};
  private totalTokens = 0;

  constructor(targetUrl: string) {
    this.targetUrl = targetUrl;
    this.startTime = performance.now();
  }

  public record(res: RequestResult): void {
    this.results.push(res);
    this.statusCodes[res.statusCode] = (this.statusCodes[res.statusCode] || 0) + 1;
    this.totalTokens += res.tokenCount;

    if (res.error) {
      this.errorCounts[res.error] = (this.errorCounts[res.error] || 0) + 1;
    }
  }

  public finalize(): SummaryReport {
    const endTime = performance.now();
    const durationSec = Math.max(0.001, (endTime - this.startTime) / 1000);

    const totalRequests = this.results.length;
    let successCount = 0;
    let errorCount = 0;

    const latencies: number[] = [];
    const ttfts: number[] = [];
    const itls: number[] = [];
    const streamTpsList: number[] = [];

    for (const r of this.results) {
      if (!r.error && r.statusCode >= 200 && r.statusCode < 300) {
        successCount++;
        latencies.push(r.durationMs);

        if (r.ttftMs > 0) {
          ttfts.push(r.ttftMs);
        }
        for (const itl of r.itlsMs) {
          itls.push(itl);
        }
        if (r.durationMs > 0 && r.tokenCount > 0) {
          streamTpsList.push((r.tokenCount / r.durationMs) * 1000);
        }
      } else {
        errorCount++;
      }
    }

    const errorRatePct = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
    const rps = totalRequests / durationSec;
    const aggregateTps = this.totalTokens / durationSec;
    const avgStreamTps =
      streamTpsList.length > 0
        ? streamTpsList.reduce((a, b) => a + b, 0) / streamTpsList.length
        : 0;

    return {
      timestamp: new Date().toISOString(),
      targetUrl: this.targetUrl,
      totalRequests,
      successCount,
      errorCount,
      errorRatePct: Number(errorRatePct.toFixed(2)),
      durationSec: Number(durationSec.toFixed(2)),
      rps: Number(rps.toFixed(2)),
      totalTokens: this.totalTokens,
      aggregateTps: Number(aggregateTps.toFixed(2)),
      avgStreamTps: Number(avgStreamTps.toFixed(2)),
      statusCodes: this.statusCodes,
      latency: calculatePercentiles(latencies),
      ttft: calculatePercentiles(ttfts),
      itl: calculatePercentiles(itls),
      errors: Object.keys(this.errorCounts).length > 0 ? this.errorCounts : undefined,
    };
  }
}

function calculatePercentiles(values: number[]): PercentileStats {
  if (values.length === 0) {
    return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0, stdDev: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const avg = sorted.reduce((a, b) => a + b, 0) / n;

  const variance = sorted.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    min: round(min),
    p50: round(getPercentile(sorted, 50)),
    p90: round(getPercentile(sorted, 90)),
    p95: round(getPercentile(sorted, 95)),
    p99: round(getPercentile(sorted, 99)),
    max: round(max),
    avg: round(avg),
    stdDev: round(stdDev),
  };
}

function getPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function round(val: number): number {
  return Math.round(val * 100) / 100;
}

function pad(val: any, width: number, alignRight: boolean = true): string {
  const str = String(val);
  if (str.length >= width) return str;
  const spaces = " ".repeat(width - str.length);
  return alignRight ? spaces + str : str + spaces;
}

export function formatReportTable(report: SummaryReport): string {
  let output = "\n";
  output += chalk.bold.cyan("========================================================================================\n");
  output += chalk.bold.white(` ⚡ TEMPEST BENCHMARK REPORT: `) + chalk.yellow(report.targetUrl) + "\n";
  output += chalk.bold.cyan("========================================================================================\n");

  output += ` Requests:       Total: ${chalk.bold(report.totalRequests)} | Success: ${chalk.green(report.successCount)} | Errors: ${report.errorCount > 0 ? chalk.red(report.errorCount) : chalk.gray(0)} (${report.errorRatePct}%)\n`;
  output += ` Throughput:     RPS: ${chalk.bold.green(report.rps)} req/s | Agg. TPS: ${chalk.bold.magenta(report.aggregateTps)} tokens/s (Total: ${report.totalTokens} tokens)\n`;
  output += ` Duration:       ${chalk.bold(report.durationSec)} seconds\n`;
  output += chalk.gray("----------------------------------------------------------------------------------------\n");

  output += chalk.bold.cyan(` ${pad("Metric (ms)", 16, false)} ${pad("Min", 9)} ${pad("p50", 9)} ${pad("p90", 9)} ${pad("p95", 9)} ${pad("p99", 9)} ${pad("Max", 9)} ${pad("Avg", 9)}\n`);
  output += chalk.gray("----------------------------------------------------------------------------------------\n");

  const row = (name: string, stat: PercentileStats) => {
    return ` ${pad(chalk.bold(name), 16, false)} ${pad(stat.min, 9)} ${pad(chalk.bold.yellow(stat.p50), 9)} ${pad(stat.p90, 9)} ${pad(stat.p95, 9)} ${pad(chalk.bold.red(stat.p99), 9)} ${pad(stat.max, 9)} ${pad(stat.avg, 9)}\n`;
  };

  output += row("TTFT", report.ttft);
  output += row("ITL", report.itl);
  output += row("Total Latency", report.latency);

  output += chalk.gray("----------------------------------------------------------------------------------------\n");

  if (Object.keys(report.statusCodes).length > 0) {
    const codes = Object.entries(report.statusCodes)
      .map(([c, count]) => `[${chalk.bold(c)}: ${count}]`)
      .join(" ");
    output += ` Status Codes:   ${codes}\n`;
  }

  if (report.errors && Object.keys(report.errors).length > 0) {
    output += chalk.red("\n Errors Encountered:\n");
    for (const [errStr, count] of Object.entries(report.errors)) {
      output += chalk.red(`   • (${count}x) ${errStr}\n`);
    }
  }

  output += chalk.bold.cyan("========================================================================================\n");
  return output;
}
