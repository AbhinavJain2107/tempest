import { MetricsCollector } from "../metrics/collector.js";
import type { EngineConfig, RequestPayload, SummaryReport } from "../types/index.js";
import { HttpClient } from "./client.js";

export class LoadRunner {
  private config: EngineConfig;
  private client: HttpClient;
  private collector: MetricsCollector;

  constructor(config: EngineConfig) {
    this.config = config;
    this.client = new HttpClient();
    this.collector = new MetricsCollector(config.targetUrl);
  }

  public async run(
    payloadGenerator: (iteration: number) => RequestPayload,
    onProgress?: (completed: number, total: number, liveRps: number) => void
  ): Promise<SummaryReport> {
    const concurrency = Math.max(1, this.config.concurrency || 10);
    const totalRequests = this.config.totalRequests || 0;
    const durationMs = this.config.durationMs || 0;
    const timeoutMs = this.config.timeoutMs || 60_000;
    const rps = this.config.rps || 0;

    let completed = 0;
    let dispatched = 0;
    let isStopped = false;
    const startTime = performance.now();

    // Timer for duration-based tests
    let durationTimer: NodeJS.Timeout | undefined;
    if (durationMs > 0) {
      durationTimer = setTimeout(() => {
        isStopped = true;
      }, durationMs);
    }

    // Rate limiter interval
    const intervalMs = rps > 0 ? 1000 / rps : 0;
    let lastDispatchTime = performance.now();

    const worker = async () => {
      while (!isStopped) {
        if (totalRequests > 0 && dispatched >= totalRequests) {
          break;
        }

        const currentIter = dispatched++;

        // Rate limiting
        if (intervalMs > 0) {
          const now = performance.now();
          const elapsed = now - lastDispatchTime;
          if (elapsed < intervalMs) {
            await new Promise((r) => setTimeout(r, intervalMs - elapsed));
          }
          lastDispatchTime = performance.now();
        }

        const payload = payloadGenerator(currentIter);

        let result;
        if (this.config.stream) {
          result = await this.client.executeStream(payload, timeoutMs);
        } else {
          result = await this.client.executeStandard(payload, timeoutMs);
        }

        this.collector.record(result);
        completed++;

        if (onProgress) {
          const liveElapsedSec = (performance.now() - startTime) / 1000;
          const liveRps = liveElapsedSec > 0 ? completed / liveElapsedSec : 0;
          onProgress(completed, totalRequests, Number(liveRps.toFixed(1)));
        }

        if (durationMs > 0 && performance.now() - startTime >= durationMs) {
          isStopped = true;
          break;
        }
      }
    };

    // Run workers concurrently
    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    if (durationTimer) {
      clearTimeout(durationTimer);
    }

    return this.collector.finalize();
  }
}
