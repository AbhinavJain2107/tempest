import { Agent, request } from "undici";
import type { RequestPayload, RequestResult } from "../types/index.js";

export class HttpClient {
  private dispatcher: Agent;

  constructor() {
    this.dispatcher = new Agent({
      keepAliveTimeout: 90_000,
      keepAliveMaxTimeout: 600_000,
      connections: 10_000, // Scaled for 1,000+ concurrent virtual users
      pipelining: 1,
      connect: {
        rejectUnauthorized: false, // For local self-signed dev LLMs
      },
    });
  }

  public async executeStream(
    payload: RequestPayload,
    timeoutMs: number = 90_000
  ): Promise<RequestResult> {
    const startTime = performance.now();
    const itlsMs: number[] = [];
    let ttftMs = 0;
    let tokenCount = 0;
    let bytesRead = 0;
    let firstTokenTime = 0;
    let lastChunkTime = 0;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...payload.headers,
    };

    try {
      const response = await request(payload.url, {
        method: (payload.method || "POST") as any,
        headers,
        body: payload.body,
        dispatcher: this.dispatcher,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });

      const statusCode = response.statusCode;

      if (statusCode < 200 || statusCode >= 300) {
        const errBody = await response.body.text();
        const endTime = performance.now();
        return {
          startTime,
          endTime,
          durationMs: endTime - startTime,
          ttftMs: 0,
          itlsMs: [],
          tokenCount: 0,
          statusCode,
          error: `HTTP ${statusCode}: ${errBody.slice(0, 200)}`,
          bytesRead: errBody.length,
          promptTokens: payload.promptTokens || 0,
        };
      }

      let buffer = "";
      for await (const chunk of response.body) {
        const chunkStr = chunk.toString("utf8");
        bytesRead += chunk.length;
        buffer += chunkStr;

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            const data = trimmed.replace(/^data:\s*/, "").trim();
            if (data === "[DONE]") {
              break;
            }

            const now = performance.now();
            if (firstTokenTime === 0) {
              firstTokenTime = now;
              ttftMs = now - startTime;
              lastChunkTime = now;
            } else {
              itlsMs.push(now - lastChunkTime);
              lastChunkTime = now;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.choices?.[0]?.delta?.content) {
                tokenCount++;
              } else if (parsed.usage?.completion_tokens) {
                tokenCount = parsed.usage.completion_tokens;
              } else {
                tokenCount++;
              }
            } catch {
              tokenCount++;
            }
          }
        }
      }

      const endTime = performance.now();
      return {
        startTime,
        endTime,
        durationMs: endTime - startTime,
        ttftMs,
        itlsMs,
        tokenCount,
        statusCode,
        bytesRead,
        promptTokens: payload.promptTokens || 0,
      };
    } catch (err: any) {
      const endTime = performance.now();
      return {
        startTime,
        endTime,
        durationMs: endTime - startTime,
        ttftMs: 0,
        itlsMs: [],
        tokenCount: 0,
        statusCode: 0,
        error: err.message || "Network Error",
        bytesRead: 0,
        promptTokens: payload.promptTokens || 0,
      };
    }
  }

  public async executeStandard(
    payload: RequestPayload,
    timeoutMs: number = 90_000
  ): Promise<RequestResult> {
    const startTime = performance.now();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...payload.headers,
    };

    try {
      const response = await request(payload.url, {
        method: (payload.method || "GET") as any,
        headers,
        body: payload.body,
        dispatcher: this.dispatcher,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });

      const bodyText = await response.body.text();
      const endTime = performance.now();
      const statusCode = response.statusCode;

      let tokenCount = 0;
      try {
        const parsed = JSON.parse(bodyText);
        if (parsed.usage?.completion_tokens) {
          tokenCount = parsed.usage.completion_tokens;
        }
      } catch {}

      return {
        startTime,
        endTime,
        durationMs: endTime - startTime,
        ttftMs: 0,
        itlsMs: [],
        tokenCount,
        statusCode,
        bytesRead: bodyText.length,
        promptTokens: payload.promptTokens || 0,
        error: statusCode >= 400 ? `HTTP ${statusCode}: ${bodyText.slice(0, 200)}` : undefined,
      };
    } catch (err: any) {
      const endTime = performance.now();
      return {
        startTime,
        endTime,
        durationMs: endTime - startTime,
        ttftMs: 0,
        itlsMs: [],
        tokenCount: 0,
        statusCode: 0,
        error: err.message || "Network Error",
        bytesRead: 0,
        promptTokens: payload.promptTokens || 0,
      };
    }
  }
}
