import fs from "node:fs/promises";
import chalk from "chalk";
import { Command } from "commander";
import { LoadRunner } from "../engine/runner.js";
import { formatFaceoffTable, runModelFaceoff } from "../features/faceoff.js";
import { formatRampTable, runRampTest } from "../features/ramp.js";
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
import { detectActiveServices } from "../utils/detector.js";
import { runInteractiveWizard } from "./wizard.js";

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
${chalk.gray("⚠️  DISCLAIMER: For authorized performance testing only. Users are solely")}
${chalk.gray("   responsible for target authorization and any third-party API/cloud costs.")}
`;

export function createCLI(): Command {
  const program = new Command();

  program
    .name("tempest")
    .description("⚡ High-performance LLM & Streaming API Load Tester")
    .version("0.3.0")
    .addHelpText("beforeAll", banner)
    .option("-j, --json-out <path>", "File path to save JSON report")
    .option("--save-baseline <path>", "Save results as baseline JSON for CI/CD comparisons")
    .option("--baseline <path>", "Compare results against this baseline JSON")
    .option("--fail-on <rules...>", "Fail conditions, e.g. 'p99_ttft > +15%' or 'error_rate > 1%'")
    .option("--markdown-out <path>", "File path to write GitHub PR Markdown diff report")
    .action(async () => {
      await runInteractiveWizard();
    });

  // Subcommand: start (One-command Auto-Detect)
  program
    .command("start")
    .description("Zero-config auto-detect running local server and start benchmark")
    .option("-c, --concurrency <number>", "Number of concurrent users", "50")
    .option("-n, --requests <number>", "Total number of requests", "200")
    .action(async (options) => {
      console.log(chalk.bold.cyan("\n🔍 Scanning for active local servers..."));
      const detected = await detectActiveServices();

      let targetUrl = "http://localhost:3000/";
      let isStream = false;

      if (detected.length > 0) {
        const top = detected[0];
        targetUrl = top.url;
        isStream = top.isStream;
        console.log(chalk.green(`✅ Auto-detected active ${top.name} on ${top.url}`));
      } else {
        console.log(chalk.yellow(`ℹ️ No open ports detected, defaulting to ${targetUrl}`));
      }

      const concurrency = parseInt(options.concurrency, 10);
      const totalRequests = parseInt(options.requests, 10);

      console.log(chalk.bold(`🚀 Launching load test: ${concurrency} users | ${totalRequests} requests against ${targetUrl}...\n`));

      const config: EngineConfig = {
        targetUrl,
        concurrency,
        totalRequests,
        stream: isStream,
        model: "llama3",
      };

      const runner = new LoadRunner(config);
      const report = await runner.run(
        (iter) => createLLMRequestPayload(config, iter),
        (completed, total, liveRps) => {
          process.stdout.write(`\rProgress: [${completed}/${total}] | Live RPS: ${liveRps}`);
        }
      );

      console.log(formatReportTable(report));
    });

  // Subcommand: ramp (Auto-Breaking Point Detector)
  program
    .command("ramp")
    .description("Automatically ramp up concurrency to find server saturation & breaking point")
    .option("-u, --target <url>", "Target endpoint URL", "http://localhost:3000/")
    .option("--start <number>", "Starting concurrent users", "10")
    .option("--max <number>", "Maximum concurrent users to test", "500")
    .option("--step <number>", "Step size of users to add each stage", "25")
    .option("--duration <number>", "Duration per step in seconds", "3")
    .option("-s, --stream", "Enable SSE streaming mode", false)
    .action(async (options) => {
      const report = await runRampTest(
        options.target,
        parseInt(options.start, 10),
        parseInt(options.max, 10),
        parseInt(options.step, 10),
        parseInt(options.duration, 10),
        options.stream
      );

      console.log(formatRampTable(report));
    });

  // Subcommand: faceoff (Model Shootout)
  program
    .command("faceoff")
    .description("Compare multiple LLM endpoints/models head-to-head in a shootout")
    .option("-c, --concurrency <number>", "Concurrency per contender", "10")
    .option("-n, --requests <number>", "Total requests per contender", "30")
    .action(async (options) => {
      const contenders = [
        { name: "Local Ollama Llama 3", url: "http://localhost:11434/v1/chat/completions", model: "llama3" },
        { name: "Local Fast Web API", url: "http://localhost:3000/", model: "default" },
      ];

      const board = await runModelFaceoff(
        contenders,
        parseInt(options.concurrency, 10),
        parseInt(options.requests, 10)
      );

      console.log(formatFaceoffTable(board));
    });

  // Subcommand: init (Create config file)
  program
    .command("init")
    .description("Create a tempest.config.json in the current directory")
    .action(async () => {
      const sampleConfig = {
        target: "http://localhost:3000/",
        concurrency: 50,
        requests: 250,
        stream: false,
        failOn: ["p99_ttft > +15%", "error_rate > 0%"],
      };

      await fs.writeFile("tempest.config.json", JSON.stringify(sampleConfig, null, 2), "utf-8");
      console.log(chalk.bold.green("\n✨ Created tempest.config.json!"));
      console.log(chalk.gray("You can now customize it and run tempest benchmarks with your settings."));
    });

  // Subcommand: bench
  program
    .command("bench")
    .description("Benchmark an LLM or streaming API endpoint")
    .option("-u, --target <url>", "Target endpoint URL", "http://localhost:11434/v1/chat/completions")
    .option("-c, --concurrency <number>", "Number of concurrent workers (supports 500, 1000+)", "10")
    .option("-n, --requests <number>", "Total number of requests", "50")
    .option("-d, --duration <string>", "Test duration (e.g. 30s, 2m)")
    .option("--rps <number>", "Rate limit in requests/sec (0 = max speed)", "0")
    .option("-s, --stream", "Enable SSE streaming mode (default)")
    .option("--no-stream", "Disable streaming (standard HTTP mode)")
    .option("-m, --model <name>", "Model identifier name (gpt-4o, claude-3-5-sonnet, llama3)", "llama3")
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
      const isStream = options.stream !== false;

      const config: EngineConfig = {
        targetUrl: options.target,
        concurrency: parseInt(options.concurrency, 10),
        totalRequests: durationMs ? undefined : parseInt(options.requests, 10),
        durationMs,
        rps: parseInt(options.rps, 10),
        stream: isStream,
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
    .option("-c, --concurrency <number>", "Number of concurrent virtual users (supports 500, 1000+)", "10")
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
