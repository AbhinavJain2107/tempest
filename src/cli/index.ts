import fs from "node:fs/promises";
import chalk from "chalk";
import { Command } from "commander";
import { LoadRunner } from "../engine/runner.js";
import { formatReportTable } from "../metrics/collector.js";
import {
  compareWithBaseline,
  generateMarkdownSummary,
  loadBaseline,
  saveBaseline,
} from "../regression/comparator.js";
import { parseHARFile } from "../scenarios/har.js";
import { createLLMRequestPayload } from "../scenarios/llm.js";
import type { EngineConfig } from "../types/index.js";

const banner = `
${chalk.bold.cyan("╔══════════════════════════════════════════════════════════════════════╗")}
${chalk.bold.cyan("║")}  ${chalk.bold.yellow("████████╗███████╗███╗   ███╗██████╗ ███████╗███████╗████████╗")}       ${chalk.bold.cyan("║")}
${chalk.bold.cyan("║")}  ${chalk.bold.yellow("╚══██╔══╝██╔════╝████╗ ████║██╔══██╗██╔════╝██╔════╝╚══██╔══╝")}       ${chalk.bold.cyan("║")}
${chalk.bold.cyan("║")}     ${chalk.bold.yellow("██║   █████╗  ██╔████╔██║██████╔╝█████╗  ███████╗   ██║")}          ${chalk.bold.cyan("║")}
${chalk.bold.cyan("║")}     ${chalk.bold.yellow("██║   ██╔══╝  ██║╚██╔╝██║██╔═══╝ ██╔══╝  ╚════██║   ██║")}          ${chalk.bold.cyan("║")}
${chalk.bold.cyan("║")}     ${chalk.bold.yellow("██║   ███████╗██║ ╚═╝ ██║██║     ███████╗███████║   ██║")}          ${chalk.bold.cyan("║")}
${chalk.bold.cyan("║")}     ${chalk.bold.yellow("╚═╝   ╚══════╝╚═╝     ╚═╝╚═╝     ╚══════╝╚══════╝   ╚═╝")}          ${chalk.bold.cyan("║")}
${chalk.bold.cyan("║")}      ${chalk.bold.white("High-Performance LLM & Streaming API Load & Regression Tester")}   ${chalk.bold.cyan("║")}
${chalk.bold.cyan("╚══════════════════════════════════════════════════════════════════════╝")}
`;

export function createCLI(): Command {
  const program = new Command();

  program
    .name("tempest")
    .description("⚡ High-performance LLM & Streaming API Load Tester")
    .version("0.1.3")
    .addHelpText("beforeAll", banner)
    .option("-j, --json-out <path>", "File path to save JSON report")
    .option("--save-baseline <path>", "Save results as baseline JSON for CI/CD comparisons")
    .option("--baseline <path>", "Compare results against this baseline JSON")
    .option("--fail-on <rules...>", "Fail conditions, e.g. 'p99_ttft > +15%' or 'error_rate > 1%'")
    .option("--markdown-out <path>", "File path to write GitHub PR Markdown diff report");

  // Subcommand: bench
  program
    .command("bench")
    .description("Benchmark an LLM or streaming API endpoint")
    .option("-u, --target <url>", "Target endpoint URL", "http://localhost:11434/v1/chat/completions")
    .option("-c, --concurrency <number>", "Number of concurrent workers", "10")
    .option("-n, --requests <number>", "Total number of requests", "50")
    .option("-d, --duration <string>", "Test duration (e.g. 30s, 2m)")
    .option("--rps <number>", "Rate limit in requests/sec (0 = max speed)", "0")
    .option("-s, --stream", "Enable SSE streaming mode", true)
    .option("-m, --model <name>", "Model identifier name", "llama3")
    .option("-a, --auth <token>", "Authorization header (e.g. 'Bearer <token>')")
    .option("--prompt-tokens <tokens...>", "List of prompt token lengths to alternate", ["50", "200", "500"])
    .option("--body <template>", "Custom JSON body template with {PROMPT} placeholder")
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      let durationMs: number | undefined;
      if (options.duration) {
        durationMs = parseDuration(options.duration);
      }

      const promptLengths = (options.promptTokens || []).map((t: string) => parseInt(t, 10));

      const config: EngineConfig = {
        targetUrl: options.target,
        concurrency: parseInt(options.concurrency, 10),
        totalRequests: durationMs ? undefined : parseInt(options.requests, 10),
        durationMs,
        rps: parseInt(options.rps, 10),
        stream: options.stream !== false,
        model: options.model,
        authHeader: options.auth,
        promptLengths,
        bodyTemplate: options.body,
      };

      console.log(`\n🚀 Starting Tempest Load Test on: ${chalk.bold.yellow(config.targetUrl)}`);
      console.log(`⚙️  Concurrency: ${chalk.bold(config.concurrency)} | Stream: ${chalk.bold(config.stream)} | Model: ${chalk.bold(config.model)}`);
      if (durationMs) {
        console.log(`⏱️  Duration: ${chalk.bold(options.duration)}`);
      } else {
        console.log(`📦 Total Requests: ${chalk.bold(config.totalRequests)}`);
      }
      console.log(chalk.gray("----------------------------------------------------------------------"));

      const runner = new LoadRunner(config);
      const report = await runner.run(
        (iter) => createLLMRequestPayload(config, iter),
        (completed, total, liveRps) => {
          const totalStr = total > 0 ? `/${total}` : "";
          process.stdout.write(`\rProgress: [${completed}${totalStr}] | Live RPS: ${liveRps}`);
        }
      );

      console.log(formatReportTable(report));

      if (globalOpts.saveBaseline) {
        await saveBaseline(globalOpts.saveBaseline, report);
        console.log(`💾 Saved benchmark baseline to: ${chalk.green(globalOpts.saveBaseline)}`);
      }

      if (globalOpts.jsonOut) {
        await fs.writeFile(globalOpts.jsonOut, JSON.stringify(report, null, 2), "utf-8");
        console.log(`📄 JSON report saved to: ${chalk.green(globalOpts.jsonOut)}`);
      }

      if (globalOpts.baseline) {
        const baseReport = await loadBaseline(globalOpts.baseline);
        const diff = compareWithBaseline(report, baseReport, globalOpts.failOn || []);
        const md = generateMarkdownSummary(diff);

        console.log("\n" + md);

        if (globalOpts.markdownOut) {
          await fs.writeFile(globalOpts.markdownOut, md, "utf-8");
          console.log(`📝 Markdown diff written to: ${chalk.green(globalOpts.markdownOut)}`);
        }

        if (!diff.passed) {
          console.error(chalk.bold.red("\n❌ CI/CD Regression Check FAILED due to SLA breaches!\n"));
          process.exit(1);
        }
      }
    });

  // Subcommand: replay
  program
    .command("replay")
    .description("Replay recorded browser traffic (.har file) under concurrent load")
    .requiredOption("-f, --har <path>", "Path to the .har file")
    .option("-c, --concurrency <number>", "Number of concurrent virtual users", "10")
    .option("-n, --requests <number>", "Total requests (defaults to length of HAR)")
    .option("-d, --duration <string>", "Test duration (e.g. 30s, 2m)")
    .option("--rps <number>", "Rate limit in requests/sec", "0")
    .option("-a, --auth <token>", "Override Authorization header for all requests")
    .option("--target-host <host>", "Override base host for all requests in HAR")
    .option("--no-filter-static", "Disable static asset filtering")
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const payloads = await parseHARFile(
        options.har,
        options.filterStatic !== false,
        options.auth,
        options.targetHost
      );

      let durationMs: number | undefined;
      if (options.duration) {
        durationMs = parseDuration(options.duration);
      }

      const totalRequests = options.requests
        ? parseInt(options.requests, 10)
        : durationMs
        ? undefined
        : payloads.length;

      const config: EngineConfig = {
        targetUrl: options.targetHost || options.har,
        concurrency: parseInt(options.concurrency, 10),
        totalRequests,
        durationMs,
        rps: parseInt(options.rps, 10),
        stream: false,
      };

      console.log(`\n📦 Loaded ${chalk.bold(payloads.length)} API requests from ${chalk.yellow(options.har)}`);
      console.log(`🚀 Starting Tempest Traffic Replay (Concurrency: ${chalk.bold(config.concurrency)})\n`);

      const runner = new LoadRunner(config);
      const report = await runner.run((iter) => payloads[iter % payloads.length]);

      console.log(formatReportTable(report));

      if (globalOpts.jsonOut) {
        await fs.writeFile(globalOpts.jsonOut, JSON.stringify(report, null, 2), "utf-8");
        console.log(`📄 JSON report saved to: ${chalk.green(globalOpts.jsonOut)}`);
      }

      if (globalOpts.baseline) {
        const baseReport = await loadBaseline(globalOpts.baseline);
        const diff = compareWithBaseline(report, baseReport, globalOpts.failOn || []);
        const md = generateMarkdownSummary(diff);
        console.log("\n" + md);

        if (!diff.passed) {
          process.exit(1);
        }
      }
    });

  // Subcommand: diff
  program
    .command("diff <baseline> <current>")
    .description("Compare two benchmark JSON reports and check SLA thresholds")
    .action(async (baselinePath, currentPath, _options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const baseReport = await loadBaseline(baselinePath);
      const curReport = await loadBaseline(currentPath);

      const diff = compareWithBaseline(curReport, baseReport, globalOpts.failOn || []);
      const md = generateMarkdownSummary(diff);

      console.log("\n" + md);

      if (globalOpts.markdownOut) {
        await fs.writeFile(globalOpts.markdownOut, md, "utf-8");
        console.log(`📝 Markdown diff written to: ${chalk.green(globalOpts.markdownOut)}`);
      }

      if (!diff.passed) {
        console.error(chalk.bold.red("\n❌ CI/CD Regression Check FAILED due to SLA breaches!\n"));
        process.exit(1);
      }
    });

  return program;
}

function parseDuration(d: string): number {
  const match = d.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${d}`);
  }
  const val = parseFloat(match[1]);
  const unit = match[2] || "s";
  switch (unit) {
    case "ms":
      return val;
    case "s":
      return val * 1000;
    case "m":
      return val * 60 * 1000;
    case "h":
      return val * 3600 * 1000;
    default:
      return val * 1000;
  }
}
