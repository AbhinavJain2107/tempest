import fs from "node:fs/promises";
import chalk from "chalk";
import type { DiffReport, MetricDiff, SummaryReport } from "../types/index.js";

export async function loadBaseline(filePath: string): Promise<SummaryReport> {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

export async function saveBaseline(filePath: string, report: SummaryReport): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");
}

export function compareWithBaseline(
  current: SummaryReport,
  baseline: SummaryReport,
  failRules: string[] = []
): DiffReport {
  const diffs: MetricDiff[] = [
    createDiff("P99 TTFT", baseline.ttft.p99, current.ttft.p99, "ms"),
    createDiff("P95 TTFT", baseline.ttft.p95, current.ttft.p95, "ms"),
    createDiff("P50 TTFT", baseline.ttft.p50, current.ttft.p50, "ms"),
    createDiff("P99 ITL", baseline.itl.p99, current.itl.p99, "ms"),
    createDiff("P95 ITL", baseline.itl.p95, current.itl.p95, "ms"),
    createDiff("P50 ITL", baseline.itl.p50, current.itl.p50, "ms"),
    createDiff("Aggregate TPS", baseline.aggregateTps, current.aggregateTps, "tokens/s"),
    createDiff("Error Rate", baseline.errorRatePct, current.errorRatePct, "%"),
    createDiff("P99 Latency", baseline.latency.p99, current.latency.p99, "ms"),
  ];

  const breaches: string[] = [];

  for (const rule of failRules) {
    const breach = evaluateRule(current, baseline, rule);
    if (breach) {
      breaches.push(breach);
    }
  }

  return {
    passed: breaches.length === 0,
    diffs,
    breaches,
  };
}

function createDiff(name: string, baseVal: number, curVal: number, unit: string): MetricDiff {
  const delta = curVal - baseVal;
  const deltaPct = baseVal > 0 ? (delta / baseVal) * 100 : 0;

  return {
    name,
    baselineVal: Number(baseVal.toFixed(2)),
    currentVal: Number(curVal.toFixed(2)),
    deltaVal: Number(delta.toFixed(2)),
    deltaPct: Number(deltaPct.toFixed(1)),
    unit,
    breached: false,
  };
}

function evaluateRule(
  current: SummaryReport,
  baseline: SummaryReport | null,
  rule: string
): string | null {
  const parts = rule.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const metricKey = parts[0].toLowerCase();
  const op = parts[1];
  const targetStr = parts[2];

  let curVal = 0;
  let baseVal = 0;

  switch (metricKey) {
    case "p99_ttft":
      curVal = current.ttft.p99;
      baseVal = baseline?.ttft.p99 || 0;
      break;
    case "p95_ttft":
      curVal = current.ttft.p95;
      baseVal = baseline?.ttft.p95 || 0;
      break;
    case "p99_itl":
      curVal = current.itl.p99;
      baseVal = baseline?.itl.p99 || 0;
      break;
    case "error_rate":
      curVal = current.errorRatePct;
      baseVal = baseline?.errorRatePct || 0;
      break;
    case "tps":
    case "aggregate_tps":
      curVal = current.aggregateTps;
      baseVal = baseline?.aggregateTps || 0;
      break;
    default:
      return null;
  }

  if (targetStr.endsWith("%") && targetStr.startsWith("+") && baseline) {
    const pctVal = parseFloat(targetStr.replace(/[+%]/g, ""));
    if (!isNaN(pctVal)) {
      const maxAllowed = baseVal * (1 + pctVal / 100);
      if (op === ">" && curVal > maxAllowed) {
        return `🚨 SLA Breach: ${metricKey} is ${curVal} ms (baseline: ${baseVal} ms, max allowed: +${pctVal}% -> ${maxAllowed.toFixed(2)} ms)`;
      }
    }
  } else {
    const cleanTarget = parseFloat(targetStr.replace(/ms|%/g, ""));
    if (!isNaN(cleanTarget)) {
      if (op === ">" && curVal > cleanTarget) {
        return `🚨 SLA Breach: ${metricKey} is ${curVal} (exceeded threshold ${cleanTarget})`;
      }
      if (op === "<" && curVal < cleanTarget) {
        return `🚨 SLA Breach: ${metricKey} is ${curVal} (below threshold ${cleanTarget})`;
      }
    }
  }

  return null;
}

export function generateMarkdownSummary(diffReport: DiffReport): string {
  const statusBadge = diffReport.passed
    ? "✅ **PERFORMANCE PASSED**"
    : "❌ **PERFORMANCE REGRESSION DETECTED**";

  let md = `### ⚡ Tempest CI/CD Benchmark Diff: ${statusBadge}\n\n`;
  md += "| Metric | Baseline | Current | Delta | Status |\n";
  md += "| :--- | :--- | :--- | :--- | :--- |\n";

  for (const diff of diffReport.diffs) {
    const deltaSign = diff.deltaVal >= 0 ? `+${diff.deltaVal}` : `${diff.deltaVal}`;
    const deltaPctSign = diff.deltaPct >= 0 ? `+${diff.deltaPct}` : `${diff.deltaPct}`;
    const deltaStr = `${deltaSign} ${diff.unit} (${deltaPctSign}%)`;

    let badge = "⚪ Stable";
    if (diff.name.includes("TTFT") || diff.name.includes("Latency") || diff.name.includes("Error")) {
      if (diff.deltaPct > 5.0) {
        badge = "🔴 Regressed";
      } else if (diff.deltaPct < -5.0) {
        badge = "🟢 Improved";
      }
    } else if (diff.name.includes("TPS")) {
      if (diff.deltaPct > 5.0) {
        badge = "🟢 Improved";
      } else if (diff.deltaPct < -5.0) {
        badge = "🔴 Regressed";
      }
    }

    md += `| **${diff.name}** | ${diff.baselineVal} ${diff.unit} | ${diff.currentVal} ${diff.unit} | ${deltaStr} | ${badge} |\n`;
  }

  if (diffReport.breaches.length > 0) {
    md += "\n#### 🚨 SLA Breaches:\n";
    for (const b of diffReport.breaches) {
      md += `- ${b}\n`;
    }
  }

  return md;
}
