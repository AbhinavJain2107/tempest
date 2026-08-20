import chalk from "chalk";
import { LoadRunner } from "../engine/runner.js";
import { createLLMRequestPayload } from "../scenarios/llm.js";
import type { EngineConfig, SummaryReport } from "../types/index.js";

export interface FaceoffTarget {
  name: string;
  url: string;
  model: string;
  authHeader?: string;
}

export interface FaceoffLeaderboard {
  ttftWinner: string;
  tpsWinner: string;
  latencyWinner: string;
  results: Array<{
    name: string;
    model: string;
    report: SummaryReport;
  }>;
}

export async function runModelFaceoff(
  targets: FaceoffTarget[],
  concurrency = 10,
  requests = 30
): Promise<FaceoffLeaderboard> {
  console.log(chalk.bold.cyan("\n⚔️  Starting Tempest Model Face-Off Shootout"));
  console.log(`Contenders: ${targets.map((t) => chalk.yellow(t.name)).join(", ")}`);
  console.log(`Concurrency: ${concurrency} users | ${requests} requests each\n`);

  const results: Array<{ name: string; model: string; report: SummaryReport }> = [];

  for (const target of targets) {
    console.log(`🥊 Testing Contender: ${chalk.bold.yellow(target.name)} (${target.model})...`);

    const config: EngineConfig = {
      targetUrl: target.url,
      concurrency,
      totalRequests: requests,
      stream: true,
      model: target.model,
      authHeader: target.authHeader,
    };

    const runner = new LoadRunner(config);
    const report = await runner.run(
      (iter) => createLLMRequestPayload(config, iter),
      (comp, tot, rps) => {
        process.stdout.write(`\r   Progress: [${comp}/${tot}] | Live RPS: ${rps}`);
      }
    );
    console.log(` -> Done! (p50 TTFT: ${report.ttft.p50}ms, TPS: ${report.aggregateTps})`);

    results.push({
      name: target.name,
      model: target.model,
      report,
    });
  }

  // Determine winners
  let bestTtft = Infinity;
  let ttftWinner = "N/A";

  let bestTps = -1;
  let tpsWinner = "N/A";

  let bestLatency = Infinity;
  let latencyWinner = "N/A";

  for (const r of results) {
    if (r.report.successCount > 0) {
      if (r.report.ttft.p50 > 0 && r.report.ttft.p50 < bestTtft) {
        bestTtft = r.report.ttft.p50;
        ttftWinner = r.name;
      }
      if (r.report.aggregateTps > bestTps) {
        bestTps = r.report.aggregateTps;
        tpsWinner = r.name;
      }
      if (r.report.latency.p50 > 0 && r.report.latency.p50 < bestLatency) {
        bestLatency = r.report.latency.p50;
        latencyWinner = r.name;
      }
    }
  }

  return {
    ttftWinner,
    tpsWinner,
    latencyWinner,
    results,
  };
}

export function formatFaceoffTable(board: FaceoffLeaderboard): string {
  let out = "\n";
  out += chalk.bold.cyan("========================================================================================\n");
  out += chalk.bold.white(` ⚔️  TEMPEST MODEL FACE-OFF LEADERBOARD\n`);
  out += chalk.bold.cyan("========================================================================================\n");

  out += ` 🥇 Fastest First Token (TTFT):   ${chalk.bold.green(board.ttftWinner)}\n`;
  out += ` 🥇 Highest Throughput (Tokens/s): ${chalk.bold.green(board.tpsWinner)}\n`;
  out += ` 🥇 Lowest Overall Latency:        ${chalk.bold.green(board.latencyWinner)}\n`;
  out += chalk.gray("----------------------------------------------------------------------------------------\n");

  const pad = (str: any, width: number) => String(str).padStart(width);
  out += chalk.cyan(`  Provider / Model          p50 TTFT      p99 TTFT      Tokens/sec    p50 Latency   Success\n`);
  out += chalk.gray("----------------------------------------------------------------------------------------\n");

  for (const r of board.results) {
    const nameStr = `${r.name} (${r.model})`.padEnd(25);
    const p50Ttft = pad(r.report.ttft.p50 + " ms", 10);
    const p99Ttft = pad(r.report.ttft.p99 + " ms", 10);
    const tps = pad(r.report.aggregateTps + " t/s", 12);
    const p50Lat = pad(r.report.latency.p50 + " ms", 11);
    const succ = pad(r.report.successCount + "/" + r.report.totalRequests, 8);

    out += `  ${nameStr} ${p50Ttft}    ${p99Ttft}    ${tps}   ${p50Lat}   ${succ}\n`;
  }

  out += chalk.bold.cyan("========================================================================================\n");
  return out;
}
