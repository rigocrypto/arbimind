/**
 * Documentation content for ArbiMind. Source-of-truth is DOCS_ENTRIES array;
 * DOCS_CONTENT is built from it. Duplicate slugs throw at module load.
 */
export interface DocPage {
  title: string;
  description: string;
  sections: { heading: string; content: string }[];
  related?: string[];
}

export type DocEntry = DocPage & { slug: string };

function assertUniqueSlugs(entries: DocEntry[]): void {
  const bySlug = new Map<string, DocEntry[]>();
  for (const e of entries) {
    const list = bySlug.get(e.slug) ?? [];
    list.push(e);
    bySlug.set(e.slug, list);
  }
  const dups: string[] = [];
  bySlug.forEach((list, slug) => {
    if (list.length > 1) {
      dups.push(`${slug} (${list.map((x) => x.title).join(', ')})`);
    }
  });
  if (dups.length) throw new Error(`Duplicate docs slugs: ${dups.join('; ')}`);
}

export const DOCS_ENTRIES: DocEntry[] = [
  { slug: 'quickstart/installation',
    title: 'Installation Guide',
    description: 'Get ArbiMind running locally in minutes.',
    sections: [
      {
        heading: 'Prerequisites',
        content: `Node.js 18+, pnpm.`,
      },
      {
        heading: 'Install',
        content: `From the repo root:
\`\`\`powershell
pnpm install
\`\`\``,
      },
      {
        heading: 'Start Backend',
        content: `Backend runs on port 8001 (configurable via PORT in .env):
\`\`\`powershell
cd packages/backend
pnpm dev
\`\`\`
Expected: \`ArbiMind Backend @ http://0.0.0.0:8001\``,
      },
      {
        heading: 'Start UI',
        content: `In a separate terminal:
\`\`\`powershell
cd packages/ui
pnpm dev
\`\`\`
Expected: \`http://localhost:3000\``,
      },
      {
        heading: 'Verify',
        content: `Check backend health:
\`\`\`powershell
curl http://localhost:8001/api/health
\`\`\`
Expected: \`{"status":"ok",...}\``,
      },
    ],
    related: ['quickstart/configuration', 'quickstart/first-trade'],
  },
  { slug: 'quickstart/configuration',
    title: 'Configuration',
    description: 'Configure ArbiMind for local development or production.',
    sections: [
      {
        heading: 'UI Environment',
        content: `Create \`packages/ui/.env.local\`:
\`\`\`
NEXT_PUBLIC_API_URL=http://localhost:8001/api
\`\`\`
For production, set this to your backend URL (e.g. \`https://arbimind-production.up.railway.app/api\`).`,
      },
      {
        heading: 'Backend Environment',
        content: `Edit \`packages/backend/.env\`. Key variables:
- \`PORT\` – backend port (default 8000; use 8001 if conflicting)
- \`FRONTEND_URL\` – allowed CORS origin(s)
- \`ADMIN_API_KEY\` – required for /api/admin/* (see Admin Setup)`,
      },
      {
        heading: 'Solana (Optional)',
        content: `For Solana transfers/swaps, set in backend .env:
- \`SOLANA_FEE_WALLET\`, \`SOLANA_FEE_PCT\`, \`SOLANA_FEE_MIN_SOL\`
- \`SOLANA_CLUSTER\` (devnet | mainnet-beta)
- \`SOLANA_JUPITER_RPC_URL\` for Jupiter swaps (mainnet RPC recommended)`,
      },
    ],
    related: ['config/environment-variables', 'quickstart/installation'],
  },
  { slug: 'quickstart/first-trade',
    title: 'First Trade',
    description: 'Connect a wallet and execute your first trade.',
    sections: [
      {
        heading: 'EVM Wallet (MetaMask / RainbowKit)',
        content: `1. Click "Connect Wallet" in the header
2. Approve MetaMask/WalletConnect
3. Switch to Sepolia (or your target chain) for testing
4. Use the strategies page to start an arbitrage strategy`,
      },
      {
        heading: 'Solana Wallet',
        content: `1. Go to /solana-wallet
2. Connect Phantom or Solflare
3. For devnet: Use solfaucet.com to airdrop SOL
4. Choose destination (Arb account or external address) and amount
5. Click "Transfer" – your wallet will prompt to sign
6. Confirm the transaction on Solscan (devnet)`,
      },
      {
        heading: 'Verify on Explorer',
        content: `After a Solana transfer, copy the signature from the toast and paste it into Solscan (devnet: \`https://explorer.solana.com/?cluster=devnet\`) to verify the transaction.`,
      },
    ],
    related: ['solana/transfers-and-fees', 'solana/overview'],
  },
  { slug: 'strategies/arbitrage-v2-v3',
    title: 'Arbitrage V2/V3',
    description: 'Cross-DEX arbitrage across Uniswap V2/V3 and compatible pools.',
    sections: [
      {
        heading: 'Overview',
        content: `ArbiMind scans for price deltas between DEXes (e.g. Uniswap V2 vs V3). When the profit exceeds your minimum threshold and gas cost, it builds and submits a swap transaction.`,
      },
      {
        heading: 'How It Works',
        content: `1. Quote prices on multiple DEXes for the same pair
2. Compute profit: (output - gas) - input
3. If profit > min threshold, submit tx via your wallet
4. Non-custodial: you sign, ArbiMind orchestrates`,
      },
      {
        heading: 'Settings',
        content: `Configure min profit (ETH), slippage, and max gas in the strategy card settings. Higher min profit = fewer but safer trades.`,
      },
    ],
    related: ['strategies/market-making', 'risk/risk-parameters'],
  },
  { slug: 'strategies/market-making',
    title: 'Market Making',
    description: 'Provide liquidity and capture spread.',
    sections: [
      {
        heading: 'Overview',
        content: `Market making involves placing limit orders or LP positions on both sides of the order book to earn the bid-ask spread.`,
      },
      {
        heading: 'ArbiMind Approach',
        content: `ArbiMind's market-making strategy manages spread-based opportunities. Configure risk level and position size in Settings.`,
      },
    ],
    related: ['strategies/arbitrage-v2-v3', 'risk/position-sizing'],
  },
  { slug: 'strategies/trend-following',
    title: 'Trend Following',
    description: 'Follow momentum with AI-assisted signals.',
    sections: [
      {
        heading: 'Overview',
        content: `Trend following strategies enter positions when momentum is detected and exit when it reverses. ArbiMind uses sentiment and price signals.`,
      },
      {
        heading: 'Settings',
        content: `Adjust risk level and confidence threshold in the strategy settings. Higher confidence = fewer but higher-conviction signals.`,
      },
    ],
    related: ['strategies/arbitrage-v2-v3', 'risk/stop-loss'],
  },
  { slug: 'risk/position-sizing',
    title: 'Position Sizing',
    description: 'Size positions to limit downside.',
    sections: [
      {
        heading: 'Principle',
        content: `Never risk more than a small percentage of capital per trade. ArbiMind enforces minimum balances (e.g. 0.05 ETH) before allowing strategy execution.`,
      },
      {
        heading: 'Balance Guard',
        content: `The UI shows "Connect first" or "Deposit 0.05 ETH" when balance is below threshold. This prevents accidental over-exposure.`,
      },
    ],
    related: ['risk/stop-loss', 'risk/risk-parameters'],
  },
  { slug: 'risk/stop-loss',
    title: 'Stop Loss',
    description: 'Limit losses when trades move against you.',
    sections: [
      {
        heading: 'Overview',
        content: `Stop-loss logic exits positions when loss exceeds a configured threshold. For arbitrage, most trades are atomic; stop-loss applies mainly to trend-following or market-making strategies.`,
      },
    ],
    related: ['risk/position-sizing', 'risk/risk-parameters'],
  },
  { slug: 'risk/risk-parameters',
    title: 'Risk Parameters',
    description: 'Configure risk controls across strategies.',
    sections: [
      {
        heading: 'Key Parameters',
        content: `- Min profit (ETH): Minimum profit threshold before execution
- Slippage: Max acceptable price move during tx
- Max gas (Gwei): Cap on gas price
- Risk level: Low / Medium / High – affects aggressiveness`,
      },
      {
        heading: 'Where to Set',
        content: `Strategy card → Settings (gear icon). Changes apply to that strategy.`,
      },
    ],
    related: ['config/strategy-settings', 'risk/position-sizing'],
  },
  { slug: 'api/rest',
    title: 'REST API',
    description: 'HTTP endpoints for ArbiMind backend.',
    sections: [
      {
        heading: 'Health',
        content: `GET /api/health
Returns backend status. Example:
\`\`\`powershell
curl http://localhost:8001/api/health
\`\`\``,
      },
      {
        heading: 'Engine',
        content: `POST /api/engine/start – body: { "strategy": "arbitrage" }
POST /api/engine/stop
GET /api/engine/status`,
      },
      {
        heading: 'Opportunities',
        content: `GET /api/opportunities – Returns live opportunities (mock/stub).`,
      },
      {
        heading: 'Execute',
        content: `POST /api/execute – Execute an opportunity by ID. Requires wallet/context.`,
      },
      {
        heading: 'Solana Transfer',
        content: `POST /api/solana/tx/transfer
Body: { "fromPubkey", "destination": "arb"|"external", "toPubkey"?, "amountSol" }
Returns: { "transactionBase64", "recentBlockhash", "lastValidBlockHeight", "feeLamports" }
Client deserializes, signs with wallet, sends, confirms.`,
      },
      {
        heading: 'Solana Jupiter Swap',
        content: `POST /api/solana/jupiter/swap-tx
Body: { "userPubkey", "side": "SOL_TO_USDC"|"USDC_TO_SOL", "amount", "slippageBps" }
Mainnet-beta only. Returns unsigned v0 tx with swap + fee instructions.`,
      },
      {
        heading: 'Admin',
        content: `All /api/admin/* require \`X-ADMIN-KEY\` header. Returns 503 if ADMIN_API_KEY not set. See Authentication.`,
      },
      {
        heading: 'Portfolio Snapshots (Admin)',
        content: `POST /api/admin/snapshots/run?chain=evm|solana&range=30d
Runs daily snapshot job for active users. Requires DATABASE_URL (Postgres). Uses advisory lock—returns 200 with { ok: false, reason: "already_running" } when job already running (no-op, cron-friendly). On success: { ok: true, chain, usersProcessed, success, failed, dayTs, acquiredLock, limitUsed, batchSize, delayMs, durationMs }. 503 = DB not configured. 500 = job failed. Run once daily (e.g. 02:05 UTC).`,
      },
    ],
    related: ['api/authentication', 'api/websocket'],
  },
  { slug: 'api/websocket',
    title: 'WebSocket',
    description: 'Real-time updates (when enabled).',
    sections: [
      {
        heading: 'Status',
        content: `WebSocket endpoints for live opportunities and engine status are planned. Currently, the UI polls REST endpoints. Check API Reference for updates.`,
      },
    ],
    related: ['api/rest', 'api/authentication'],
  },
  { slug: 'api/authentication',
    title: 'Authentication',
    description: 'Admin API authentication.',
    sections: [
      {
        heading: 'Admin Key',
        content: `Admin endpoints require \`X-ADMIN-KEY: <your-key>\` header. The key must match \`ADMIN_API_KEY\` set in the backend.`,
      },
      {
        heading: '503 if Not Configured',
        content: `If \`ADMIN_API_KEY\` is not set in the backend, all /api/admin/* requests return 503 with message: "Admin API not configured (ADMIN_API_KEY missing)". Set it in packages/backend/.env locally and in Railway variables for production.`,
      },
      {
        heading: '401 on Invalid Key',
        content: `Wrong or missing key returns 401 Unauthorized.`,
      },
    ],
    related: ['admin/setup', 'api/rest'],
  },
  { slug: 'config/environment-variables',
    title: 'Environment Variables',
    description: 'Complete list of env vars for UI and backend.',
    sections: [
      {
        heading: 'UI (packages/ui/.env.local)',
        content: `| Variable | Description |
|----------|-------------|
| NEXT_PUBLIC_API_URL | Backend API base (e.g. http://localhost:8001/api) |
| NEXT_PUBLIC_SOLANA_CLUSTER | devnet \| testnet \| mainnet-beta |
| NEXT_PUBLIC_SOLANA_RPC_URL | Optional RPC override |
| NEXT_PUBLIC_SOLANA_ARB_ACCOUNT | MVP arb account (display only) |`,
      },
      {
        heading: 'Backend (packages/backend/.env)',
        content: `| Variable | Description |
|----------|-------------|
| ADMIN_API_KEY | Required for /api/admin/*. 503 if missing. |
| FRONTEND_URL | CORS allowed origin(s) |
| SOLANA_ARB_ACCOUNT | Default arb recipient |
| SOLANA_FEE_WALLET | Fee destination pubkey |
| SOLANA_FEE_PCT | Fee % (e.g. 0.5) |
| SOLANA_FEE_MIN_SOL | Min fee in SOL (e.g. 0.001) |
| SOLANA_CLUSTER | devnet \| mainnet-beta |
| SOLANA_RPC_URL | Optional RPC override |
| SOLANA_JUPITER_RPC_URL | Mainnet RPC for Jupiter swaps |
| DATABASE_URL | Postgres for portfolio snapshots (optional) |`,
      },
    ],
    related: ['config/strategy-settings', 'admin/setup'],
  },
  { slug: 'config/strategy-settings',
    title: 'Strategy Settings',
    description: 'Customize strategy behavior.',
    sections: [
      {
        heading: 'Available Settings',
        content: `Per-strategy settings (gear icon on strategy card):
- Min Profit (ETH)
- Risk Level (Low / Medium / High)
- Max Gas (Gwei)`,
      },
      {
        heading: 'Best Practices',
        content: `- Min Profit: 0.01 ETH is a safe starting point
- Risk: Medium for balanced behavior
- Gas: 50 Gwei for mainnet opportunities`,
      },
    ],
    related: ['config/environment-variables', 'config/gas-optimization'],
  },
  { slug: 'config/gas-optimization',
    title: 'Gas Optimization',
    description: 'Reduce gas costs for higher net profit.',
    sections: [
      {
        heading: 'Principles',
        content: `Successful arbitrage requires profit > gas. ArbiMind only executes when estimated profit exceeds gas plus your min threshold.`,
      },
      {
        heading: 'Settings',
        content: `Set Max Gas Gwei in strategy settings. Lower = fewer executions but lower cost. Use gas trackers to tune.`,
      },
    ],
    related: ['config/strategy-settings', 'risk/risk-parameters'],
  },
  { slug: 'solana/overview',
    title: 'Solana Overview',
    description: 'Solana integration in ArbiMind.',
    sections: [
      {
        heading: 'Route',
        content: `The Solana wallet lives at /solana-wallet with a route-level provider. EVM wallet is separate; use the chain switcher to navigate.`,
      },
      {
        heading: 'Wallets',
        content: `Phantom, Solflare, and other Wallet Standard adapters are supported. Connect via the wallet button on /solana-wallet.`,
      },
      {
        heading: 'Networks',
        content: `Transfers: devnet or mainnet (env-driven). Jupiter swaps: mainnet-beta only for MVP.`,
      },
    ],
    related: ['solana/transfers-and-fees', 'solana/jupiter-swaps'],
  },
  { slug: 'solana/transfers-and-fees',
    title: 'Solana Transfers & Fees',
    description: 'Non-custodial SOL transfers with protocol fee.',
    sections: [
      {
        heading: 'Flow',
        content: `1. User enters amount and destination (Arb account or external address)
2. UI calls POST /api/solana/tx/transfer
3. Backend builds unsigned v0 VersionedTransaction with two instructions: user→recipient, user→fee wallet
4. UI deserializes, wallet signs, sends, confirms with blockhash/lastValidBlockHeight`,
      },
      {
        heading: 'Fee Logic',
        content: `Fee = max(SOLANA_FEE_MIN_SOL, amount * SOLANA_FEE_PCT / 100). Fee is an additional SOL transfer to SOLANA_FEE_WALLET.`,
      },
      {
        heading: 'Fee Preview',
        content: `The UI shows estimated total (amount + fee) before signing.`,
      },
      {
        heading: 'Security',
        content: `Non-custodial: backend never signs. User signs with their wallet. Fee capture is a separate instruction in the same tx.`,
      },
    ],
    related: ['solana/overview', 'solana/jupiter-swaps'],
  },
  { slug: 'solana/jupiter-swaps',
    title: 'Jupiter Swaps (Mainnet)',
    description: 'SOL ↔ USDC swaps via Jupiter. Mainnet-beta only.',
    sections: [
      {
        heading: 'Mainnet Only',
        content: `Jupiter swap routes are mainnet-beta. Set NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta and use real SOL/USDC. The UI disables swap when not on mainnet.`,
      },
      {
        heading: 'Flow',
        content: `1. User selects SOL→USDC or USDC→SOL, amount, slippage
2. UI calls POST /api/solana/jupiter/swap-tx
3. Backend gets Jupiter quote + swap tx, appends SOL fee instruction, returns base64 v0 tx
4. UI deserializes, signs, sends, confirms`,
      },
      {
        heading: 'Fee',
        content: `Same fee model as transfers: SOLANA_FEE_PCT and SOLANA_FEE_MIN_SOL. Fee is collected in SOL. Keep a small SOL balance for network + protocol fees.`,
      },
    ],
    related: ['solana/transfers-and-fees', 'solana/overview'],
  },
  { slug: 'concepts/arbitrage-trading',
    title: 'Arbitrage Trading',
    description: 'Buy low on one market, sell high on another.',
    sections: [
      {
        heading: 'Definition',
        content: `Arbitrage is buying an asset on one market and selling it on another to profit from price differences. ArbiMind scans DEXes for these opportunities and executes when profit exceeds your threshold.`,
      },
      {
        heading: 'ArbiMind Approach',
        content: `Cross-DEX scanning (Uniswap V2/V3, Sushi, etc.), atomic execution, and non-custodial signing.`,
      },
    ],
    related: ['strategies/arbitrage-v2-v3', 'concepts/mev'],
  },
  { slug: 'concepts/slippage',
    title: 'Slippage',
    description: 'Price movement between quote and execution.',
    sections: [
      {
        heading: 'Definition',
        content: `Slippage is the difference between the expected price and the actual execution price. In volatile markets, price can move between quote and tx confirmation.`,
      },
      {
        heading: 'Managing Slippage',
        content: `Set slippage tolerance (e.g. 0.5%) in strategy settings. Higher slippage = more fills but potentially worse execution.`,
      },
    ],
    related: ['risk/risk-parameters', 'concepts/gas-fees'],
  },
  { slug: 'concepts/gas-fees',
    title: 'Gas & Fees',
    description: 'Network and protocol costs.',
    sections: [
      {
        heading: 'EVM Gas',
        content: `Ethereum and L2s charge gas. ArbiMind only executes when estimated profit > gas + min threshold. Set max gas Gwei in strategy settings.`,
      },
      {
        heading: 'Solana',
        content: `Solana uses lamports for fees. Transfers and Jupiter swaps include a protocol fee (configurable via SOLANA_FEE_PCT, SOLANA_FEE_MIN_SOL).`,
      },
    ],
    related: ['config/gas-optimization', 'concepts/fee-model'],
  },
  { slug: 'concepts/mev',
    title: 'MEV (Maximal Extractable Value)',
    description: 'Value extractable from block production.',
    sections: [
      {
        heading: 'Definition',
        content: `MEV is profit from reordering, inserting, or censoring transactions in a block. Arbitrage is one form of MEV.`,
      },
      {
        heading: 'ArbiMind',
        content: `ArbiMind helps capture arbitrage-based MEV across DEXes. Use private RPC/relays for production to reduce front-running.`,
      },
    ],
    related: ['concepts/arbitrage-trading', 'strategies/arbitrage-v2-v3'],
  },
  { slug: 'concepts/non-custodial-signing',
    title: 'Non-Custodial Signing',
    description: 'You hold keys; ArbiMind never signs for you.',
    sections: [
      {
        heading: 'Model',
        content: `The backend builds unsigned transactions. Your wallet (MetaMask, Phantom, etc.) signs them. ArbiMind never has access to private keys.`,
      },
      {
        heading: 'Solana Example',
        content: `POST /api/solana/tx/transfer returns base64 unsigned v0 tx. UI deserializes, wallet signs, client sends. Same pattern for Jupiter swaps.`,
      },
    ],
    related: ['solana/transfers-and-fees', 'api/rest'],
  },
  { slug: 'concepts/fee-model',
    title: 'Fee Model',
    description: 'How ArbiMind captures protocol fees.',
    sections: [
      {
        heading: 'Solana Transfers',
        content: `Fee = max(SOLANA_FEE_MIN_SOL, amount * SOLANA_FEE_PCT / 100). Fee is a separate SOL transfer instruction to SOLANA_FEE_WALLET in the same tx.`,
      },
      {
        heading: 'Jupiter Swaps',
        content: `Same fee logic. Fee collected in SOL. User keeps a small SOL balance for network + protocol fees.`,
      },
    ],
    related: ['solana/transfers-and-fees', 'solana/jupiter-swaps'],
  },
  { slug: 'wallet/arb-portfolio',
    title: 'Arbitrage Account Portfolio',
    description: 'How portfolio attribution works for the arb account.',
    sections: [
      {
        heading: 'Overview',
        content: `The Arbitrage Account Portfolio view shows deposits, balances, P&L, ROI, and analytics for funds you've sent to the ArbiMind arbitrage account. It is available on both /wallet (EVM) and /solana-wallet (Solana).`,
      },
      {
        heading: 'Deposit-Based Attribution (MVP)',
        content: `For MVP, we attribute portfolio value to users by on-chain deposit transactions. When you transfer ETH/USDC (EVM) or SOL/USDC (Solana) to the arb account address, those transfers are detected and credited to your connected wallet. No database or signatures required—same wallet address always yields the same computed results.`,
      },
      {
        heading: 'EVM Deposits',
        content: `EVM deposits are detected by querying Transfer events for USDC (and native ETH when supported) from your address to the configured EVM_ARB_ACCOUNT. The backend uses an RPC provider (EVM_RPC_URL, Alchemy, or Infura). A rolling window (e.g. last 30 days / 10k blocks) is used to limit scan size.`,
      },
      {
        heading: 'Solana Deposits',
        content: `Solana deposits are detected via getSignaturesForAddress on the arb account, then getParsedTransaction to parse SystemProgram transfer instructions. Transfers from your pubkey to the arb address are counted as deposits. Fee wallet transfers are excluded. SPL USDC support is planned.`,
      },
      {
        heading: 'Portfolio Summary',
        content: `The summary includes:
- Total deposited (USD, from cached live prices—see USD Pricing below)
- Total withdrawn (if detected)
- Current arb account balance attributed to you
- Net P&L and ROI %
- Fees paid
- Last updated timestamp`,
      },
      {
        heading: 'Charts',
        content: `Timeseries analytics show:
- Equity curve (total value over time)
- Daily P&L (bar chart)
- Drawdown % (peak-to-trough decline)

Charts use daily aggregation. When Postgres snapshots exist (method: snapshotted_daily_equity), charts show real historical equity. Otherwise, equity/PnL/drawdown are approximated via linear ramp (method: estimated_linear_ramp_to_current_equity). Charts display "(Est.)" only when estimated.`,
      },
      {
        heading: 'Daily Snapshots (Postgres)',
        content: `With DATABASE_URL set, run daily: POST /api/admin/snapshots/run?chain=evm&range=30d (and chain=solana). Requires X-ADMIN-KEY. Schedule via Railway Cron or external scheduler. Active users (from portfolio_users) get snapshots. Timeseries returns snapshotted_daily_equity when ≥2 points exist.`,
      },
      {
        heading: 'Configuration',
        content: `Backend .env:
- EVM_ARB_ACCOUNT – EVM arb address (required for EVM portfolio)
- SOLANA_ARB_ACCOUNT – Solana arb pubkey (required for Solana portfolio)
- EVM_RPC_URL / SOLANA_RPC_URL – RPC endpoints
- PORTFOLIO_EVM_SCAN_NATIVE=true – optional; enable native ETH deposit detection (Alchemy only)
- COINGECKO_ENABLED=true – enable live prices (default true)
- COINGECKO_TTL_SECONDS=600 – cache TTL in seconds (default 10 min)

If arb account is not configured, the UI shows "Portfolio data unavailable".`,
      },
      {
        heading: 'USD Pricing',
        content: `USD values use cached live prices from CoinGecko (ETH, SOL, USDC). Prices are cached for ~10 minutes (configurable via COINGECKO_TTL_SECONDS). If CoinGecko is unreachable or rate-limited, the backend falls back to static estimates (ETH ~$3000, SOL ~$200, USDC $1). Set COINGECKO_ENABLED=false to use static prices only.

Local testing: Call a portfolio endpoint twice within the TTL window. The first call fetches from CoinGecko; the second uses the cache (check LOG_LEVEL=debug for "[priceService] prices from cache").`,
      },
      {
        heading: 'MVP P&L Definition',
        content: `P&L = current arb account balance minus total deposits. Does not include fees, external positions, or realized vs unrealized breakdown. USD values use cached CoinGecko prices (or static fallback when unavailable).`,
      },
    ],
    related: ['solana/transfers-and-fees', 'quickstart/first-trade', 'api/rest'],
  },
  { slug: 'admin/setup',
    title: 'Admin Setup',
    description: 'Configure admin dashboard access.',
    sections: [
      {
        heading: '503 If ADMIN_API_KEY Missing',
        content: `If ADMIN_API_KEY is not set, the backend returns 503 for all /api/admin/* requests with: "Admin API not configured (ADMIN_API_KEY missing)". Fix: set the variable.`,
      },
      {
        heading: 'Local',
        content: `Add to packages/backend/.env:
\`\`\`
ADMIN_API_KEY=your-secret-key
\`\`\`
Use a strong random key in production (e.g. \`openssl rand -hex 32\`).`,
      },
      {
        heading: 'Railway',
        content: `Railway Dashboard → Backend service → Variables → Add ADMIN_API_KEY with your secret. Redeploy.`,
      },
      {
        heading: 'Login',
        content: `Visit /admin and enter the same key. It is sent as X-ADMIN-KEY header. Never expose the key in the UI.`,
      },
    ],
    related: ['api/authentication', 'config/environment-variables'],
  },
];

assertUniqueSlugs(DOCS_ENTRIES);

export const DOCS_CONTENT: Record<string, DocPage> = Object.fromEntries(
  DOCS_ENTRIES.map((e) => {
    const { slug, ...page } = e;
    return [slug, page];
  })
);

export const DOC_PATHS = DOCS_ENTRIES.map((e) => e.slug);
