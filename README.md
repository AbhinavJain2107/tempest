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

Traditional load testing tools (like JMeter or ApacheBench) only measure static response duration. **Tempest** is designed specifically for **modern AI, high-concurrency (1,000+ users), and streaming architectures**:

- ⚡ **Interactive Terminal Wizard:** Just run `npx tempest-load` to launch a step-by-step interactive benchmark.
- 🔍 **Zero-Config Auto-Detect (`tempest start`):** Automatically scans for active Next.js (port 3000), Ollama (port 11434), FastAPI (port 8000), or Express (port 8080) servers and starts load testing instantly.
- 🚀 **1,000+ Concurrent Virtual Users:** High-throughput async connection pool capable of firing heavy workloads from a single machine.
- 📊 **Real-time SSE Streaming Metrics:** Measures **TTFT** (Time to First Token), **ITL** (Inter-Token Latency), and **TPS** (Tokens Per Second) with microsecond precision.
- 🔄 **HAR & Traffic Replay:** Ingests recorded browser sessions (`.har` files), strips static assets, and replays authentic API sequences across thousands of simulated users.
- 🛡️ **CI/CD Performance Regression:** Compares test runs against a baseline JSON, fails PRs if latency degrades (e.g. `p99_ttft > +15%`), and renders rich GitHub PR comment diff tables.

---

## 🚀 Instant Usage (Zero Install)

### 1. Interactive Wizard Mode (Easiest)
Run in any repository terminal:
```bash
npx tempest-load
```
Follow the interactive arrow-key prompts to pick your target and choose your load level (Light, Medium, Heavy, 1,000 Users, or Custom).

---

### 2. Auto-Detect Mode (`tempest start`)
Scans your open local ports and fires immediately with zero questions:
```bash
npx tempest-load start
```

---

### 3. Custom CLI Commands

```bash
# Benchmark local Ollama / AI endpoint with 100 concurrent streams
npx tempest-load bench --target http://localhost:11434/v1/chat/completions --model llama3 -c 100 -n 500

# High-concurrency stress test with 1,000 concurrent users
npx tempest-load bench --target http://localhost:3000/api/search -c 1000 -n 5000 --no-stream

# Replay a recorded browser .har session across 50 users
npx tempest-load replay --har session.har -c 50

# Save and compare CI/CD baseline performance
npx tempest-load bench --target http://localhost:3000/api/chat --save-baseline baseline.json
npx tempest-load bench --target http://localhost:3000/api/chat --baseline baseline.json --fail-on "p99_ttft > +15%"
```

---

## 🛠️ CLI Reference

| Command | Description |
| :--- | :--- |
| `npx tempest-load` | Interactive arrow-key menu wizard |
| `npx tempest-load start` | Zero-config: auto-detects running local servers and tests immediately |
| `npx tempest-load init` | Drops a `tempest.config.json` for one-command execution |
| `npx tempest-load bench` | Custom synthetic load test with custom flags |
| `npx tempest-load replay` | Replay captured `.har` traffic under concurrent load |
| `npx tempest-load diff` | Compare two benchmark JSON files and evaluate SLA rules |

---

## 🧪 Testing

```bash
pnpm test
```

## 📄 License
MIT © 2026 Abhinav Jain
