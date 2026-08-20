import * as p from "@clack/prompts";
import chalk from "chalk";
import { LoadRunner } from "../engine/runner.js";
import { formatFaceoffTable, runModelFaceoff } from "../features/faceoff.js";
import { formatRampTable, runRampTest } from "../features/ramp.js";
import { formatReportTable } from "../metrics/collector.js";
import { createLLMRequestPayload } from "../scenarios/llm.js";
import type { EngineConfig } from "../types/index.js";
import { detectActiveServices } from "../utils/detector.js";

export async function runInteractiveWizard(): Promise<void> {
  console.clear();
  p.intro(chalk.bold.cyan("⚡ Tempest — High Performance Load & AI Benchmark Tester"));

  const detected = await detectActiveServices();

  const mainAction = await p.select({
    message: "What would you like to run?",
    options: [
      { value: "bench", label: "🚀 Standard Load Test", hint: "Test concurrency against a local/cloud target" },
      { value: "ramp", label: "📈 Auto-Breaking Point Ramp Test", hint: "Find maximum capacity and saturation limit" },
      { value: "faceoff", label: "⚔️ Model Shootout / Face-Off", hint: "Compare multiple LLM models/endpoints head-to-head" },
    ],
  });

  if (p.isCancel(mainAction)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Action: Ramp Test
  if (mainAction === "ramp") {
    let target = "http://localhost:3000/";
    if (detected.length > 0) {
      target = detected[0].url;
    }

    const inputTarget = await p.text({
      message: "Target URL to find saturation breaking point for:",
      initialValue: target,
      validate: (v) => (v.startsWith("http://") || v.startsWith("https://") ? undefined : "Enter a valid URL"),
    });

    if (p.isCancel(inputTarget)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }

    const report = await runRampTest(String(inputTarget), 10, 500, 25, 3, false);
    console.log(formatRampTable(report));
    p.outro(chalk.bold.green("✨ Saturation ramp test complete!"));
    return;
  }

  // Action: Face-Off
  if (mainAction === "faceoff") {
    const contenders = [
      { name: "Local Ollama Llama 3", url: "http://localhost:11434/v1/chat/completions", model: "llama3" },
      { name: "Local Fast Server", url: "http://localhost:3000/", model: "default" },
    ];

    const s = p.spinner();
    s.start("Running Model Shootout across contenders...");
    const leaderboard = await runModelFaceoff(contenders, 10, 20);
    s.stop("Shootout finished!");

    console.log(formatFaceoffTable(leaderboard));
    p.outro(chalk.bold.green("✨ Model Face-Off complete!"));
    return;
  }

  // Standard Benchmark Flow
  const targetChoices: Array<{ value: string; label: string; hint?: string }> = [];

  for (const s of detected) {
    targetChoices.push({
      value: s.url,
      label: `🔍 Auto-Detected: ${s.name} (${s.url})`,
      hint: "Active locally",
    });
  }

  targetChoices.push(
    { value: "http://localhost:3000/", label: "🌐 Local Web App / API (http://localhost:3000/)" },
    { value: "http://localhost:11434/v1/chat/completions", label: "🤖 Local LLM / Ollama (port 11434)" },
    { value: "custom", label: "✏️ Custom URL or Endpoint" }
  );

  const selectedTarget = await p.select({
    message: "Select target endpoint to benchmark:",
    options: targetChoices,
  });

  if (p.isCancel(selectedTarget)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  let finalTargetUrl = String(selectedTarget);
  if (selectedTarget === "custom") {
    const customInput = await p.text({
      message: "Enter the full target URL:",
      placeholder: "http://localhost:8000/api/v1/query",
      validate: (value) => {
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
          return "URL must start with http:// or https://";
        }
      },
    });

    if (p.isCancel(customInput)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }
    finalTargetUrl = String(customInput);
  }

  const modeChoice = await p.select({
    message: "Choose test mode:",
    options: [
      { value: "standard", label: "Standard HTTP / Web App (POST/GET)", hint: "For Next.js, Express, REST APIs" },
      { value: "stream", label: "AI Streaming SSE (TTFT, ITL, Tokens/sec)", hint: "For Ollama, vLLM, OpenAI" },
    ],
  });

  if (p.isCancel(modeChoice)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const isStream = modeChoice === "stream";

  const tierChoice = await p.select({
    message: "Select load concurrency tier:",
    options: [
      { value: "light", label: "🟢 Light Load", hint: "20 users | 100 requests" },
      { value: "medium", label: "🟡 Medium Load", hint: "100 users | 500 requests" },
      { value: "heavy", label: "🟠 Heavy Load", hint: "500 users | 2,500 requests" },
      { value: "extreme", label: "🔴 Extreme Stress", hint: "1,000 users | 5,000 requests" },
      { value: "custom", label: "🚀 Custom Load", hint: "Enter your own user & request count" },
    ],
  });

  if (p.isCancel(tierChoice)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  let concurrency = 20;
  let totalRequests = 100;

  switch (tierChoice) {
    case "light":
      concurrency = 20;
      totalRequests = 100;
      break;
    case "medium":
      concurrency = 100;
      totalRequests = 500;
      break;
    case "heavy":
      concurrency = 500;
      totalRequests = 2500;
      break;
    case "extreme":
      concurrency = 1000;
      totalRequests = 5000;
      break;
    case "custom": {
      const customUsers = await p.text({
        message: "How many concurrent virtual users?",
        placeholder: "250",
        validate: (v) => (!isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0 ? undefined : "Enter a valid positive number"),
      });
      if (p.isCancel(customUsers)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }
      concurrency = parseInt(String(customUsers), 10);

      const customReqs = await p.text({
        message: "Total requests to send?",
        placeholder: "1000",
        validate: (v) => (!isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0 ? undefined : "Enter a valid positive number"),
      });
      if (p.isCancel(customReqs)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }
      totalRequests = parseInt(String(customReqs), 10);
      break;
    }
  }

  const s = p.spinner();
  s.start(chalk.yellow(`Firing Tempest Load Test: ${concurrency} users, ${totalRequests} requests against ${finalTargetUrl}...`));

  const config: EngineConfig = {
    targetUrl: finalTargetUrl,
    concurrency,
    totalRequests,
    stream: isStream,
    model: "llama3",
  };

  const runner = new LoadRunner(config);
  const report = await runner.run(
    (iter) => createLLMRequestPayload(config, iter),
    (completed, total, liveRps) => {
      s.message(`Progress: [${completed}/${total}] requests | Live RPS: ${liveRps}`);
    }
  );

  s.stop(chalk.green(`Benchmark completed in ${report.durationSec}s!`));
  console.log(formatReportTable(report));
  p.outro(chalk.bold.green("✨ Benchmark finished successfully!"));
}
