/**
 * shadow-report — print a Solana shadow performance report.
 *
 * Reads a snapshot written by ShadowSnapshotWriter during a log-only run and
 * renders it. Read-only: opens no network connection, loads no wallet, and
 * cannot enable or perform trading.
 *
 * Usage:
 *   pnpm --filter @arbimind/bot shadow-report [path] [--json]
 *
 * Path resolution order:
 *   1. first positional argument
 *   2. SOLANA_SHADOW_SNAPSHOT_PATH
 *   3. ./shadow-snapshot.json
 */

import { readShadowSnapshot, renderShadowReport } from './solana/ShadowReport';

const DEFAULT_PATH = 'shadow-snapshot.json';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const positional = args.find((a) => !a.startsWith('--'));
  const filePath = positional ?? process.env['SOLANA_SHADOW_SNAPSHOT_PATH'] ?? DEFAULT_PATH;

  let snapshot;
  try {
    snapshot = await readShadowSnapshot(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Exit non-zero so a CI or cron wrapper cannot mistake "no snapshot" for
    // "a run with nothing to report".
    process.stderr.write(
      `shadow-report: cannot read snapshot at ${filePath}\n  ${message}\n\n` +
        'Set SOLANA_SHADOW_SNAPSHOT_PATH during the shadow run so a snapshot is written.\n',
    );
    process.exitCode = 1;
    return;
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${renderShadowReport(snapshot)}\n`);
}

void main();
