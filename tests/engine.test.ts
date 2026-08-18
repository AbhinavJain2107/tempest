import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LoadRunner } from "../src/engine/runner.js";
import { compareWithBaseline } from "../src/regression/comparator.js";
import type { EngineConfig, RequestPayload } from "../src/types/index.js";

describe("Tempest Engine & Metrics Test Suite", () => {
  let server: http.Server;
  let serverUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Emulate TTFT (20ms initial pause)
      setTimeout(() => {
        let count = 0;
        const interval = setInterval(() => {
          if (count < 5) {
            res.write(`data: {"choices":[{"delta":{"content":"word_${count} "}}]}\n\n`);
            count++;
          } else {
            res.write("data: [DONE]\n\n");
            res.end();
            clearInterval(interval);
          }
        }, 10);
      }, 20);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}/v1/chat/completions`;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  it("should benchmark streaming SSE endpoints and accurately compute TTFT, ITL, and tokens", async () => {
    const config: EngineConfig = {
      targetUrl: serverUrl,
      concurrency: 4,
      totalRequests: 12,
      stream: true,
    };

    const runner = new LoadRunner(config);
    const report = await runner.run((): RequestPayload => ({
      url: serverUrl,
      method: "POST",
      headers: {},
      body: JSON.stringify({ model: "test", stream: true }),
    }));

    expect(report.totalRequests).toBe(12);
    expect(report.successCount).toBe(12);
    expect(report.errorCount).toBe(0);
    expect(report.totalTokens).toBe(60); // 12 requests * 5 tokens
    expect(report.ttft.p50).toBeGreaterThanOrEqual(15);
    expect(report.itl.p50).toBeGreaterThanOrEqual(5);
  });

  it("should detect performance regressions against baseline", () => {
    const baseline = {
      timestamp: new Date().toISOString(),
      targetUrl: "http://test",
      totalRequests: 100,
      successCount: 100,
      errorCount: 0,
      errorRatePct: 0,
      durationSec: 10,
      rps: 10,
      totalTokens: 500,
      aggregateTps: 50,
      avgStreamTps: 5,
      statusCodes: { 200: 100 },
      latency: { min: 50, p50: 100, p90: 150, p95: 180, p99: 200, max: 250, avg: 110, stdDev: 20 },
      ttft: { min: 20, p50: 30, p90: 40, p95: 45, p99: 50, max: 60, avg: 32, stdDev: 5 },
      itl: { min: 5, p50: 10, p90: 12, p95: 14, p99: 15, max: 20, avg: 10, stdDev: 2 },
    };

    const regressedRun = {
      ...baseline,
      ttft: { ...baseline.ttft, p99: 95 }, // +90% regression
    };

    const diff = compareWithBaseline(regressedRun, baseline, ["p99_ttft > +15%"]);
    expect(diff.passed).toBe(false);
    expect(diff.breaches.length).toBe(1);
    expect(diff.breaches[0]).toContain("SLA Breach");
  });
});
