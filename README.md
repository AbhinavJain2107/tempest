# ⚡ Tempest

> **High-Performance LLM & Streaming API Load Tester with Traffic Replay and CI/CD Performance Regression Checks**

```
╔══════════════════════════════════════════════════════════════════════╗
║  ████████╗███████╗███╗   ███╗██████╗ ███████╗███████╗████████╗       ║
║  ╚══██╔══╝██╔════╝████╗ ████║██╔══██╗██╔════╝██╔════╝╚══██╔══╝       ║
║     ██║   █████╗  ██╔████╔██║██████╔╝█████╗  ███████╗   ██║          ║
║     ██║   ██╔══╝  ██║╚██╔╝██║██╔═══╝ ██╔══╝  ╚════██║   ██║          ║
║     ██║   ███████╗██║ ╚═╝ ██║██║     ███████╗███████║   ██║          ║
║     ╚═╝   ╚══════╝╚═╝     ╚═╝╚═╝     ╚══════╝╚══════╝   ╚═╝          ║
║      High-Performance LLM & Streaming API Load & Regression Tester   ║
╚══════════════════════════════════════════════════════════════════════╝
```

[![CI](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-blue.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)]()

Traditional load testing tools (like wrk, Apache JMeter) only measure total response duration and HTTP status codes. **Tempest** is designed specifically for **modern AI & streaming architectures**:

- ⚡ **Real-time SSE Streaming Metrics:** Measures **TTFT** (Time to First Token), **ITL** (Inter-Token Latency), and **TPS** (Tokens Per Second) with microsecond precision.
- 🎯 **Prompt Length Matrix:** Automatically alternates between short, medium, and long synthetic prompts (50, 200, 500+ tokens) to simulate realistic variable prompt workloads.
- 🔄 **HAR & Traffic Replay:** Ingests recorded browser sessions (`.har` files from Chrome/Firefox DevTools), strips static assets, and replays authentic API sequences across thousands of concurrent users.
- 🛡️ **CI/CD Performance Regression Action:** Compares test runs against a baseline JSON, fails pull requests if p99 TTFT degrades (e.g. `p99_ttft > +15%`), and renders rich GitHub PR comment diff tables.

---

## 📦 Installation

```bash
# Install globally via npm/pnpm
npm install -g tempest-load
# or run directly with npx
npx tempest-load bench --target http://localhost:11434/v1/chat/completions
```

Or clone and build from source:

```bash
git clone https://github.com/tempest-load/tempest.git
cd tempest
pnpm install
pnpm build
npm link
```

---

## 🚀 Quickstart

### 1. Benchmarking an LLM Streaming Endpoint (Ollama / vLLM / OpenAI)

Run 100 requests with 10 concurrent streams against a local Ollama instance:

```bash
tempest bench \
  --target http://localhost:11434/v1/chat/completions \
  --model llama3 \
  --concurrency 10 \
  --requests 100 \
  --stream
```

#### Output:
```
======================================================================
 ⚡ TEMPEST BENCHMARK REPORT: http://localhost:11434/v1/chat/completions
======================================================================
 Requests:       Total: 100 | Success: 100 | Errors: 0 (0%)
 Throughput:     RPS: 12.40 req/s | Agg. TPS: 412.30 tokens/s (Total: 4123 tokens)
 Duration:       8.06 seconds
----------------------------------------------------------------------
┌───────────────┬───────┬────────┬────────┬────────┬────────┬────────┬────────┐
│ Metric (ms)   │ Min   │ p50    │ p90    │ p95    │ p99    │ Max    │ Avg    │
├───────────────┼───────┼────────┼────────┼────────┼────────┼────────┼────────┤
│ TTFT          │ 18.20 │ 32.50  │ 45.10  │ 52.80  │ 68.40  │ 72.10  │ 34.10  │
│ ITL           │ 4.10  │ 8.20   │ 11.50  │ 13.20  │ 16.80  │ 18.50  │ 8.60   │
│ Total Latency │ 120.4 │ 240.5  │ 310.2  │ 345.6  │ 398.1  │ 412.0  │ 245.2  │
└───────────────┴───────┴────────┴────────┴────────┴────────┴────────┴────────┘
----------------------------------------------------------------------
 Status Codes:   [200: 100]
======================================================================
```

---

### 2. Replaying Real Traffic from a HAR file

Export a `.har` file from Chrome DevTools (Network tab -> Export HAR) and replay it with 20 simulated concurrent users:

```bash
tempest replay \
  --har session.har \
  --concurrency 20 \
  --target-host https://staging-api.example.com \
  --auth "Bearer $AUTH_TOKEN"
```

---

### 3. CI/CD Performance Regression Testing

1. **Save baseline on `main` branch:**
   ```bash
   tempest bench --target https://api.example.com/v1/chat/completions --save-baseline main-baseline.json
   ```

2. **Run comparison on Pull Requests:**
   ```bash
   tempest bench \
     --target https://staging-api.example.com/v1/chat/completions \
     --baseline main-baseline.json \
     --fail-on "p99_ttft > +15%" "error_rate > 1%" \
     --markdown-out pr-diff.md
   ```

If the threshold is breached, Tempest exits with code `1`, blocking the PR from merging.

#### GitHub PR Diff Table:

| Metric | Baseline | Current | Delta | Status |
| :--- | :--- | :--- | :--- | :--- |
| **P99 TTFT** | 45.00 ms | 68.40 ms | +23.40 ms (+52.0%) | 🔴 Regressed |
| **P95 TTFT** | 38.00 ms | 42.10 ms | +4.10 ms (+10.8%) | 🔴 Regressed |
| **P50 TTFT** | 28.00 ms | 27.50 ms | -0.50 ms (-1.8%) | ⚪ Stable |
| **Aggregate TPS** | 380.00 tokens/s | 420.00 tokens/s | +40.00 tokens/s (+10.5%) | 🟢 Improved |
| **Error Rate** | 0.00 % | 0.00 % | +0.00 % (+0.0%) | ⚪ Stable |

---

## 🛠️ CLI Reference

### `tempest bench`
| Flag | Default | Description |
| :--- | :--- | :--- |
| `-u, --target <url>` | `http://localhost:11434/...` | Target HTTP / SSE endpoint |
| `-c, --concurrency <int>` | `10` | Number of concurrent virtual streams |
| `-n, --requests <int>` | `50` | Total number of requests |
| `-d, --duration <string>` | `""` | Duration of test (e.g. `30s`, `2m`) |
| `--rps <int>` | `0` | Rate limit per second (0 = max throughput) |
| `-s, --stream` | `true` | Enable SSE streaming mode |
| `-m, --model <string>` | `llama3` | Model name in request payload |
| `-a, --auth <token>` | `""` | Authorization header |
| `--prompt-tokens <int...>` | `50, 200, 500` | Alternate prompt lengths |
| `--body <template>` | `""` | Custom JSON body template with `{PROMPT}` |

---

## 🧪 Testing

```bash
pnpm test
```

## 📄 License
MIT © 2026 Abhinav Jain
