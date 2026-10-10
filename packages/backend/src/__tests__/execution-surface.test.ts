import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Execution-surface registry for the PUBLIC backend process.
//
// Every backend source file that can sign or broadcast a transaction must be
// listed here with its policy. A new signing/broadcast call site anywhere in
// src/ fails this test until someone classifies it deliberately -- which is
// how POST /api/solana/tx/withdraw sat unauthenticated for eight months: no
// inventory existed, so nothing noticed a treasury signer behind only CORS.
// ---------------------------------------------------------------------------

const SRC = path.resolve(__dirname, '..');

const SIGN_OR_BROADCAST =
  /\.sign\(\s*\[|signTransaction\(|signAllTransactions\(|sendTransaction\(|sendRawTransaction\(|sendAndConfirm\w*\(|writeContract\(|new (?:ethers\.)?Wallet\(/;

const REGISTRY: Record<string, string> = {
  // Relays a transaction the CLIENT already signed; RPCs are pinned to devnet.
  // The server holds no key on this path.
  'routes/solanaDevnet.ts': 'RELAY_CLIENT_SIGNED_DEVNET_ONLY',
  // Signs with the treasury key on a connection pinned to devnet. Reachable
  // only through POST /api/solana/bot-control (adminAuth, shared ADMIN_KEY);
  // executeOpportunity currently has no callers. Needs hardening, not public.
  'services/SolanaExecutor.ts': 'SIGNING_DEVNET_ADMIN_GATED',
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|js)$/.test(entry.name) ? [full] : [];
  });
}

function signingFiles(): string[] {
  return sourceFiles(SRC)
    .filter((file) => SIGN_OR_BROADCAST.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
    .sort();
}

describe('backend execution surface', () => {
  it('every signing/broadcast call site is registered with an explicit policy', () => {
    expect(signingFiles()).toEqual(Object.keys(REGISTRY).sort());
  });

  it('routes/solanaTx.ts (public /api/solana/tx/*) cannot sign or broadcast', () => {
    const source = fs.readFileSync(path.join(SRC, 'routes/solanaTx.ts'), 'utf8');
    expect(source).not.toMatch(SIGN_OR_BROADCAST);
  });
});
