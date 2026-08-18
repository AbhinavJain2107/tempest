import fs from "node:fs/promises";
import path from "node:path";
import type { RequestPayload } from "../types/index.js";

const STATIC_EXTENSIONS = new Set([
  ".js",
  ".css",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".map",
  ".mp4",
]);

export async function parseHARFile(
  filePath: string,
  filterStatic: boolean = true,
  authOverride?: string,
  targetHostOverride?: string
): Promise<RequestPayload[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(content);

  const entries = parsed.log?.entries || [];
  const payloads: RequestPayload[] = [];

  for (const entry of entries) {
    let reqUrl = entry.request?.url;
    if (!reqUrl) continue;

    try {
      const urlObj = new URL(reqUrl);

      if (filterStatic) {
        const ext = path.extname(urlObj.pathname).toLowerCase();
        if (STATIC_EXTENSIONS.has(ext)) {
          continue;
        }
      }

      if (targetHostOverride) {
        const targetObj = new URL(targetHostOverride);
        urlObj.protocol = targetObj.protocol;
        urlObj.host = targetObj.host;
        reqUrl = urlObj.toString();
      }

      const headers: Record<string, string> = {};
      for (const h of entry.request?.headers || []) {
        const lower = h.name.toLowerCase();
        if (lower === "host" || lower === "content-length" || lower.startsWith(":")) {
          continue;
        }
        headers[h.name] = h.value;
      }

      if (authOverride) {
        headers["Authorization"] = authOverride;
      }

      payloads.push({
        url: reqUrl,
        method: entry.request?.method || "GET",
        headers,
        body: entry.request?.postData?.text,
      });
    } catch {
      continue;
    }
  }

  if (payloads.length === 0) {
    throw new Error("No valid API requests found in HAR file.");
  }

  return payloads;
}
