# Contributing to Tempest ⚡

Thank you for your interest in contributing to **Tempest**! We welcome bug reports, feature suggestions, documentation improvements, and pull requests.

---

## 🛠️ Development Setup

### 1. Prerequisites
* **Node.js**: `>= 20.0.0`
* **pnpm**: `>= 9.0.0` (or `npm`)

### 2. Fork and Clone
```bash
git clone https://github.com/AbhinavJain2107/tempest.git
cd tempest
```

### 3. Install Dependencies
```bash
pnpm install
```

### 4. Build and Run in Development Mode
```bash
# Build binary bundle with tsup
pnpm build

# Run local CLI during development
pnpm dev --help
pnpm dev start
```

---

## 🧪 Testing

We use **Vitest** for unit and integration testing. Always ensure all tests pass before submitting a pull request:

```bash
# Run test suite
pnpm test
```

---

## 📂 Project Architecture

* **`src/engine/`**: High-throughput async connection pool (`undici`) and SSE streaming client with microsecond token timers.
* **`src/features/`**:
  * `cost.ts`: Real-time AI token pricing and monthly cloud budget calculator.
  * `integrity.ts`: Output health, truncation, and rate-limit degradation evaluator.
  * `ramp.ts`: Auto-saturation and capacity breaking point detector.
  * `faceoff.ts`: Multi-model shootout comparison matrix.
* **`src/metrics/`**: Percentile distributions (`p50`, `p90`, `p95`, `p99`) and ASCII report formatting.
* **`src/scenarios/`**: Synthetic prompt generation and `.har` traffic session replay.
* **`src/regression/`**: CI/CD baseline JSON diffing and PR markdown generator.
* **`src/cli/`**: Commander commands and `@clack/prompts` interactive wizard.

---

## 🚀 Pull Request Workflow

1. **Create a Feature Branch:**
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. **Make your changes:** Follow clean TypeScript conventions and keep codebase modular.
3. **Run Tests and Build:**
   ```bash
   pnpm test
   pnpm build
   ```
4. **Commit your changes:** Use clear commit messages (e.g., `feat: add support for Anthropic stream headers`).
5. **Open a Pull Request:** Push to your fork and submit a PR against `main` on [GitHub](https://github.com/AbhinavJain2107/tempest).

---

## 💬 Code of Conduct

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to abide by its terms.
