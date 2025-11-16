# Copilot instructions for ArbiMind

This file gives focused, actionable guidance for coding agents working in the ArbiMind monorepo.
Keep it short — reference exact files and commands the agent should inspect or run.

1. Repository layout (important folders)
   - `packages/ui` — Next.js dashboard (frontend). Look for `src/app` and `src/components`.
   - `packages/bot` — TypeScript arbitrage bot (off-chain detection + execution).
     - Key files: `src/index.ts`, `src/config/*` (tokens.ts, dexes.ts, index.ts), `src/services/*` (ArbitrageBot, ExecutionService, PriceService).
   - `packages/backend` — Express AI microservice. Key files: `src/index.ts`, `src/services/AIService.ts`, `src/routes/ai.ts` and `src/middleware/*`.
   - `packages/contracts` — Solidity contracts (Foundry). See `foundry.toml`, `src/*.sol`, `script/*.s.sol`.

2. How to run & dev commands (monorepo)
   - Install: `npm install` (root). This uses npm workspaces (`packages/*`).
   - Build all: `npm run build` (root) — runs `build` for workspaces.
   - Run bot locally (fast dev loop): `npm run dev:bot` (root) which maps to `npm run dev --workspace=@arbimind/bot`.
     - Inside `packages/bot`: `npm run dev` (uses `tsx watch src/index.ts`).
     - Useful test runner: `npm run test:ai` (runs `tsx src/test-ai.ts`).
   - Run backend: `cd packages/backend && npm run dev` (nodemon + ts). Production: `npm run build && npm start`.
   - Contracts: `cd packages/contracts && forge build` and `forge test` / `forge script` for deployment.

3. Configuration & environment
   - Most services use `.env`. See root `.env.example` and `packages/bot/src/config/index.ts` for required env vars.
   - Bot requires: `ETHEREUM_RPC_URL`, `PRIVATE_KEY`, `TREASURY_ADDRESS`. The bot validates formats in `validateConfig()` — update tests or code with that in mind.
   - Contracts read `ETHEREUM_RPC_URL`, `SEPOLIA_RPC_URL`, and `ETHERSCAN_API_KEY` via `foundry.toml` templating.

4. Project-specific conventions and patterns
   - Monorepo with npm workspaces: use root npm scripts for workspace-wide tasks. Prefer `npm run <cmd> --workspace=@arbimind/<pkg>` when targeting one package.
   - Bot dev loop uses `tsx watch` (no tsc emit). Build uses `tsc` to produce `dist/`.
   - Backend dev uses `nodemon src/index.ts` with `ts-node`—watching TS directly.
   - Ethers v6 is used across packages — review `packages/bot` and `packages/backend` for v6 API shapes.
   - Graceful shutdown is implemented in `packages/bot/src/index.ts` and `packages/backend/src/index.ts` — preserve `SIGINT`/`SIGTERM` handling when editing startup logic.
   - Configuration is centralized under `packages/bot/src/config/*` (tokens, dexes, index). Changing token pairs or DEXs should be done here.
   - AI models live in `packages/backend/src/models` and are orchestrated by `AIService.ts` — prefer model changes through the service interfaces (`initialize`, `predict`, `train`, `shutdown`).

5. Integration points to check before code changes
   - Off-chain bot -> on-chain execution: `packages/bot/src/services/ExecutionService.ts` and the on-chain contract `packages/contracts/src/ArbExecutor.sol`.
   - Backend WebSocket API: `packages/backend/src/services/WebSocketService.ts` and server setup in `src/index.ts`.
   - Private relay support: env `PRIVATE_RELAY_URL` (bot config) — if adding relay logic, reuse `config.privateRelayUrl`.

6. Tests & quick checks
   - Unit tests use `jest` in packages. Run `npm test` at root to run workspace tests.
   - Quick manual AI smoke test: `cd packages/bot && npm run test:ai` (invokes `src/test-ai.ts`).
   - Contracts tests: `cd packages/contracts && forge test`.

7. When touching code, follow these focused checks
   - If you change an env key, update `.env.example` and `packages/*/config` validation.
   - If you change types or public service methods, update the `packages/backend/src/routes` usage and any callers in `packages/bot`.
   - If you modify smart contract ABI/ABI shapes, update any `ethers` calls in `packages/bot`/`packages/backend` to match v6 signatures.

8. Helpful file pointers (start here)
   - Startup & wiring: `packages/bot/src/index.ts`, `packages/backend/src/index.ts`.
   - Config: `packages/bot/src/config/index.ts`, `packages/bot/src/config/dexes.ts`, `packages/bot/src/config/tokens.ts`.
   - AI orchestration: `packages/backend/src/services/AIService.ts`, `packages/backend/src/models/*`.
   - Execution paths: `packages/bot/src/services/ArbitrageBot.ts`, `packages/bot/src/services/ExecutionService.ts` and `packages/contracts/src/ArbExecutor.sol`.

If anything here is unclear or you want more detail (examples of common edits, test fixtures, or a short checklist for safe deploys), tell me which area to expand and I'll iterate.

## Quick Code Examples

### 1. Add a New Token & Pair (Bot)
Edit `packages/bot/src/config/tokens.ts` — add the token to `ALLOWLISTED_TOKENS` and add any new pair to `TOKEN_PAIRS`.

```ts
// packages/bot/src/config/tokens.ts
export const ALLOWLISTED_TOKENS = {
   ...ALLOWLISTED_TOKENS,
   ARB: {
      address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      symbol: "ARB",
      name: "Arbitrum",
      decimals: 18,
      logoURI: "https://assets.coingecko.com/coins/images/23941/thumb/arb.png"
   }
};

export const TOKEN_PAIRS = [
   ...TOKEN_PAIRS,
   { tokenA: 'WETH', tokenB: 'ARB' }
];
```

Notes: use the same `ALLOWLISTED_TOKENS` shape and add any new pairs to `TOKEN_PAIRS` so the bot's scanners pick them up.

### 2. Add a New DEX Router
Edit `packages/bot/src/config/dexes.ts` and add a new keyed config to `DEX_CONFIG`.

```ts
// packages/bot/src/config/dexes.ts
DEX_CONFIG['CAMELOT_V3'] = {
   name: 'Camelot V3',
   router: '0x1F...Router',
   factory: '0x1F...Factory',
   fee: 0.005, // 0.5% or appropriate fee value
   version: 'v3',
   feeTiers: [500, 3000],
   enabled: true
};
```

Notes: match the `DexConfig` interface in the file and set `enabled: true` to include it in `ENABLED_DEXES`.

### 3. Run Bot in Test Mode
Run the bundled AI smoke/test script from the bot package:

```bash
npm run test:ai
# -> Executes packages/bot/src/test-ai.ts with mock data
```

### 4. Deploy a Foundry Script (example)
Run from `packages/contracts` (ensure `ETHEREUM_RPC_URL` and `PRIVATE_KEY` env vars are set):

```bash
forge script script/DeployArbExecutor.s.sol --broadcast --verify -vvvv
```

## Deployment Safety Checklist
A minimal checklist to run before broadcasting deployments or restarting production services.

Step | Command / Action
:--- | :---
1. Validate config | Start the bot or backend in a safe test environment (they run `validateConfig()` on startup). Alternatively run typecheck for the bot package:

```bash
npm --workspace=@arbimind/bot run typecheck
```

2. Run unit tests (JS/TS) | `npm test` (root) — runs workspace tests
3. Run contract tests | `cd packages/contracts && forge test`
4. Dry-run script | `forge script script/DeployArbExecutor.s.sol --dry-run --rpc-url $RPC_URL`
5. Update ABI in bot (if contract changed)

PowerShell example to copy ABI from Foundry `out` to bot `src/abi`:

```powershell
Copy-Item -Path .\packages\contracts\out\ArbExecutor.sol\ArbExecutor.json -Destination .\packages\bot\src\abi\ -Force
```

6. Restart bot (example using pm2) | `pm2 restart arbimind-bot` (ensure pm2 process was configured)

Notes: Not all steps are automated in this repo — copying ABIs and pm2 setup are operational steps that must be scripted into your CI/CD if desired.

## Local Dev Flow (Windows PowerShell)

```powershell
# 1. Install dependencies
npm install

# 2. Start all services in development (root workspace scripts)
npm run dev

# 3. Run AI smoke test
npm run test:ai

# 4. Build contracts
cd packages/contracts; forge build

# 5. Run a Foundry script (example)
forge script script/Deploy.s.sol --rpc-url $env:ETHEREUM_RPC_URL --private-key $env:PRIVATE_KEY
```

---

If you'd like, I can commit these exact examples now and then generate the Production CSP, Docker + PM2 config, and CI/CD (GitHub Actions) artifacts you mentioned.

