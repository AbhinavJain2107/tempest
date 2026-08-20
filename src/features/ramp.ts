import chalk from "chalk";
import { LoadRunner } from "../engine/runner.js";
import { createLLMRequestPayload } from "../scenarios/llm.js";
import type { EngineConfig } from "../types/index.js";

export interface RampStepResult {
  concurrency: number;
  requests: number;
  rps: number;
  p95LatencyMs: number;
  errorRatePct: number;
  durationSec: number;
}

export interface RampReport {
  targetUrl: string;
  optimalConcurrency: number;
  saturationThroughputRps: number;
  breakingPointConcurrency?: number;
  breakingReason?: string;
  steps: RampStepResult[];
}

export async function runRampTest(
  targetUrl: string,
  startUsers = 10,
  maxUsers = 500,
  stepSize = 25,
  stepDurationSec = 3,
  isStream = false
): Promise<RampReport> {
  console.log(chalk.bold.cyan("\n📈 Starting Tempest Auto-Saturation Ramp Test"));
  console.log(`🎯 Target: ${chalk.yellow(targetUrl)}`);
  console.log(`🪜 Stepping from ${startUsers} to ${maxUsers} users (+${stepSize} users every ${stepDurationSec}s)...\n`);

  const steps: RampStepResult[] = [];
  let baselineP95 = 0;
  let breakingConcurrency: number | undefined;
  let breakingReason: string | undefined;
  let optimalConcurrency = startUsers;
  let maxRps = 0;

  for (let users = startUsers; users <= maxUsers; users += stepSize) {
    const config: EngineConfig = {
      targetUrl,
      concurrency: users,
      durationMs: stepDurationSec * 1000,
      stream: isStream,
      model: "llama3",
      timeoutMs: 15_000,
    };

    process.stdout.write(`\r⏳ Testing ${chalk.bold.yellow(users)} concurrent users... `);

    const runner = new LoadRunner(config);
    const report = await runner.run((iter) => createLLMRequestPayload(config, iter));

    const p95 = report.latency.p95;
    const errorPct = report.errorRatePct;
    const rps = report.rps;

    if (baselineP95 === 0 && p95 > 0) {
      baselineP95 = p95;
    }

    if (rps > maxRps && errorPct < 5) {
      maxRps = rps;
      optimalConcurrency = users;
    }

    steps.push({
      concurrency: users,
      requests: report.totalRequests,
      rps,
      p95LatencyMs: p95,
      errorRatePct: errorPct,
      durationSec: report.durationSec,
    });

    // Check for breaking point (latency spike > 300% of baseline OR error rate > 10%)
    if (baselineP95 > 0 && p95 > baselineP95 * 3.0) {
      breakingConcurrency = users;
      breakingReason = `Latency spiked by +${Math.round(((p95 - baselineP95) / baselineP95) * 100)}% (${baselineP95.toFixed(1)}ms -> ${p95.toFixed(1)}ms)`;
      break;
    }

    if (errorPct > 10.0) {
      breakingConcurrency = users;
      breakingReason = `Error rate spiked to ${errorPct}% (Server dropped connections)`;
      break;
    }
  }

  process.stdout.write("\r" + " ".repeat(60) + "\r");

  return {
    targetUrl,
    optimalConcurrency,
    saturationThroughputRps: maxRps,
    breakingPointConcurrency: breakingConcurrency,
    breakingReason,
    steps,
  };
}

export function formatRampTable(report: RampReport): string {
  let out = "\n";
  out += chalk.bold.cyan("========================================================================================\n");
  out += chalk.bold.white(` 📈 TEMPEST SATURATION & BREAKING POINT REPORT: `) + chalk.yellow(report.targetUrl) + "\n";
  out += chalk.bold.cyan("========================================================================================\n");

  out += ` Optimal Capacity:    ${chalk.bold.green(report.optimalConcurrency + " users")} (Peak Throughput: ${chalk.bold.green(report.saturationThroughputRps.toFixed(1) + " req/s")})\n`;
  if (report.breakingPointConcurrency) {
    out += ` Breaking Point:      ${chalk.bold.red(report.breakingPointConcurrency + " users")} (${chalk.red(report.breakingReason)})\n`;
  } else {
    out += ` Breaking Point:      ${chalk.green("None detected within tested range (Server remained healthy)")}\n`;
  }
  out += chalk.gray("----------------------------------------------------------------------------------------\n");

  out += chalk.cyan(`  Users   Requests   Throughput (RPS)   p95 Latency   Error %   Status\n`);
  out += chalk.gray("----------------------------------------------------------------------------------------\n");

  for (const s of report.steps) {
    let status = chalk.green("🟢 Healthy");
    if (report.breakingPointConcurrency && s.concurrency >= report.breakingPointConcurrency) {
      status = chalk.red("🔴 Saturated / Degraded");
    }

    const pad = (str: any, width: number) => String(str).padStart(width);
    out += `  ${pad(s.concurrency, 5)}   ${pad(s.requests, 8)}   ${pad(s.rps.toFixed(1) + " req/s", 16)}   ${pad(s.p95LatencyMs.toFixed(1) + " ms", 11)}   ${pad(s.errorRatePct + "%", 7)}   ${status}\n`;
  }

  out += chalk.bold.cyan("========================================================================================\n");
  return out;
}
