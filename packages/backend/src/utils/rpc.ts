type HealthStatus = 'healthy' | 'unavailable';

export interface RpcHealthResult {
  chain: string;
  status: HealthStatus;
  rpcUrl: string | null;
  error?: string;
}

export const CHAIN_ALIASES: Record<string, string> = {
  evm: 'evm',
  worldchain: 'worldchain_sepolia',
  worldchain_sepolia: 'worldchain_sepolia',
  solana: 'solana',
  solana_devnet: 'solana',
};

function normalizeChain(chain: string): string {
  const key = chain.trim().toLowerCase();
  return CHAIN_ALIASES[key] ?? key;
}

function toEnvStem(chain: string): string {
  return normalizeChain(chain).replace(/[^a-z0-9]+/gi, '_').toUpperCase();
}

function splitUrls(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => /^https?:\/\//i.test(part));
}

function getCandidateEnvValues(chain: string): string[] {
  const envStem = toEnvStem(chain);
  const values: string[] = [];

  const direct = process.env[`${envStem}_RPC_URL`]?.trim();
  if (direct) values.push(direct);

  const list = process.env[`${envStem}_RPC_URLS`]?.trim();
  if (list) values.push(...splitUrls(list));

  const normalized = normalizeChain(chain);
  if (normalized === 'evm') {
    const evmDirect = process.env.EVM_RPC_URL?.trim();
    if (evmDirect) values.push(evmDirect);

    const evmList = process.env.EVM_RPC_URLS?.trim();
    if (evmList) values.push(...splitUrls(evmList));

    const arbitrum = process.env.ARBITRUM_RPC_URL?.trim();
    if (arbitrum) values.push(arbitrum);

    const polygon = process.env.POLYGON_RPC_URL?.trim();
    if (polygon) values.push(polygon);

    const ethereum = process.env.ETHEREUM_RPC_URL?.trim();
    if (ethereum) values.push(ethereum);
  }

  if (normalized === 'solana') {
    const solana = process.env.SOLANA_RPC_URL?.trim();
    if (solana) values.push(solana);
  }

  if (normalized === 'worldchain_sepolia') {
    const worldchain = process.env.WORLDCHAIN_SEPOLIA_RPC_URL?.trim();
    if (worldchain) values.push(worldchain);

    const alchemyKey = process.env.ALCHEMY_API_KEY?.trim();
    if (alchemyKey) {
      values.push(`https://worldchain-sepolia.g.alchemy.com/v2/${alchemyKey}`);
    }
  }

  return values;
}

export function resolveRpcUrl(chain: string, fallbackUrls: string[] = []): string | null {
  const fromEnv = getCandidateEnvValues(chain);
  const first = [...fromEnv, ...fallbackUrls].find((url) => /^https?:\/\//i.test(url));
  return first ?? null;
}

async function postJsonWithTimeout(url: string, body: unknown, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkRpcHealth(chain: string): Promise<RpcHealthResult> {
  const normalized = normalizeChain(chain);
  const rpcUrl = resolveRpcUrl(normalized);
  if (!rpcUrl) {
    return {
      chain: normalized,
      status: 'unavailable',
      rpcUrl: null,
      error: 'RPC URL not configured',
    };
  }

  try {
    if (normalized === 'solana') {
      const response = await postJsonWithTimeout(rpcUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { result?: string; error?: { message?: string } };
      if (payload.error) throw new Error(payload.error.message || 'RPC error');
      if (payload.result !== 'ok') throw new Error('Unexpected Solana health response');
      return { chain: normalized, status: 'healthy', rpcUrl };
    }

    const response = await postJsonWithTimeout(rpcUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_chainId',
      params: [],
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { result?: string; error?: { message?: string } };
    if (payload.error) throw new Error(payload.error.message || 'RPC error');
    if (!payload.result) throw new Error('Missing eth_chainId result');

    return { chain: normalized, status: 'healthy', rpcUrl };
  } catch (error) {
    return {
      chain: normalized,
      status: 'unavailable',
      rpcUrl,
      error: error instanceof Error ? error.message : 'RPC check failed',
    };
  }
}
