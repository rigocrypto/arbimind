import { chromium } from '@playwright/test';

const baseUrl = process.env.SMOKE_BASE_URL || 'https://arbimind.vercel.app';
const paths = (process.env.SMOKE_PATHS || '/settings,/wallet,/solana-wallet')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 60000);
const settleMs = Number(process.env.SMOKE_SETTLE_MS || 2500);
const retries = Number(process.env.SMOKE_RETRIES || (process.env.CI ? 1 : 0));

const fatalConsolePatterns = [
  /Uncaught\s+SyntaxError/i,
  /SyntaxError:\s/i,
  /Hydration failed/i,
  /hydration mismatch/i,
  /Text content does not match server-rendered HTML/i,
];

const softConsolePatterns = [
  /ChunkLoadError/i,
  /Loading chunk .* failed/i,
];

function short(text, max = 220) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isBenignAbort(url, reason) {
  return reason.includes('ERR_ABORTED') && url.includes('_rsc=');
}

function isSoftConsoleError(message) {
  return softConsolePatterns.some((pattern) => pattern.test(message));
}

function isHardConsoleError(message) {
  return fatalConsolePatterns.some((pattern) => pattern.test(message));
}

function classifyResult(result) {
  if (result.status === 401 || result.status === 403) {
    return { kind: 'hard', reason: `document status ${result.status}` };
  }

  if (result.status === 404) {
    return { kind: 'hard', reason: 'document status 404' };
  }

  if (result.status >= 500) {
    return { kind: 'soft', reason: `document status ${result.status}` };
  }

  const hardConsole = result.consoleErrors.find((msg) => isHardConsoleError(msg));
  if (hardConsole) {
    return { kind: 'hard', reason: `console error: ${short(hardConsole, 120)}` };
  }

  const hardRequestFailure = result.requestFailures.find(
    (req) => !/net::ERR_/i.test(req.reason)
  );
  if (hardRequestFailure) {
    return { kind: 'hard', reason: `request failed: ${short(hardRequestFailure.reason, 120)}` };
  }

  const transientRequestFailure = result.requestFailures.find((req) => /net::ERR_/i.test(req.reason));
  if (transientRequestFailure) {
    return { kind: 'soft', reason: `transient network: ${short(transientRequestFailure.reason, 120)}` };
  }

  const hardBadResponse = result.badResponses.find((res) => res.status === 401 || res.status === 403 || res.status === 404);
  if (hardBadResponse) {
    return { kind: 'hard', reason: `resource status ${hardBadResponse.status}` };
  }

  const softBadResponse = result.badResponses.find((res) => res.status >= 500);
  if (softBadResponse) {
    return { kind: 'soft', reason: `resource status ${softBadResponse.status}` };
  }

  const walletMissing = result.path === '/solana-wallet' && result.walletButtonVisible === false;
  if (walletMissing) {
    return { kind: 'hard', reason: 'missing [data-testid=solana-connect] / wallet connect button' };
  }

  if (result.status === 0) {
    return { kind: 'soft', reason: 'no document response' };
  }

  return { kind: 'pass', reason: 'ok' };
}

async function isWalletConnectVisible(page) {
  const byTestId = page.getByTestId('solana-connect').first();
  const testIdVisible = await byTestId.isVisible({ timeout: 3000 }).catch(() => false);
  if (testIdVisible) return true;

  const byRole = page.getByRole('button', { name: /connect wallet|select wallet/i }).first();
  return byRole.isVisible({ timeout: 10000 }).catch(() => false);
}

async function auditPath(browser, path) {
  const startedAt = Date.now();
  const page = await browser.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  const badResponses = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(short(msg.text()));
    }
  });

  page.on('requestfailed', (req) => {
    const reason = req.failure()?.errorText || 'unknown';
    const url = req.url();
    if (isBenignAbort(url, reason)) return;
    requestFailures.push({
      url: short(url),
      method: req.method(),
      reason: short(reason),
    });
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (!url.includes(baseUrl) && !url.includes('/api/')) return;
    badResponses.push({ url: short(url), status });
  });

  const url = `${baseUrl}${path}`;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForTimeout(settleMs);

  let walletButtonVisible = null;
  if (path === '/solana-wallet') {
    walletButtonVisible = await isWalletConnectVisible(page);
  }

  const result = {
    path,
    status: response?.status() ?? 0,
    title: await page.title(),
    durationMs: Date.now() - startedAt,
    walletButtonVisible,
    consoleErrors,
    requestFailures,
    badResponses,
  };

  await page.close();
  return result;
}

async function visitPage(browser, path, options = { retries: 0 }) {
  const maxSoftRetries = Math.max(1, options.retries);
  let attempt = 0;

  while (attempt <= maxSoftRetries) {
    try {
      const result = await auditPath(browser, path);
      const classification = classifyResult(result);

      if (classification.kind === 'pass') {
        console.log(
          `UI SMOKE ✅ ${path} (${result.status}) in ${result.durationMs}ms | consoleErrors=${result.consoleErrors.length} | reqFails=${result.requestFailures.length}`
        );
        return { ...result, outcome: 'pass' };
      }

      if (classification.kind === 'hard') {
        console.log(`UI SMOKE ❌ ${path} ${classification.reason}`);
        return { ...result, outcome: 'hard-fail', failReason: classification.reason };
      }

      if (attempt < maxSoftRetries) {
        console.log(`UI SMOKE ⚠️ ${path} soft-fail (${classification.reason}) retrying ${attempt + 1}/${maxSoftRetries}…`);
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      console.log(`UI SMOKE ❌ ${path} soft-fail persisted after ${maxSoftRetries} retry: ${classification.reason}`);
      return {
        ...result,
        outcome: 'hard-fail',
        failReason: `soft-fail persisted: ${classification.reason}`,
      };
    } catch (error) {
      const isTimeout = error?.name === 'TimeoutError' || /timeout/i.test(String(error?.message || ''));
      const reason = isTimeout ? 'navigation timeout' : short(String(error?.message || error), 160);

      if (attempt < maxSoftRetries) {
        console.log(`UI SMOKE ⚠️ ${path} soft-fail (${reason}) retrying ${attempt + 1}/${maxSoftRetries}…`);
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      console.log(`UI SMOKE ❌ ${path} soft-fail persisted after ${maxSoftRetries} retry: ${reason}`);
      return {
        path,
        status: 0,
        title: '',
        durationMs: 0,
        walletButtonVisible: null,
        consoleErrors: [],
        requestFailures: [],
        badResponses: [],
        outcome: 'hard-fail',
        failReason: `soft-fail persisted: ${reason}`,
      };
    }
  }

  return {
    path,
    status: 0,
    title: '',
    durationMs: 0,
    walletButtonVisible: null,
    consoleErrors: [],
    requestFailures: [],
    badResponses: [],
    outcome: 'hard-fail',
    failReason: 'unexpected retry flow termination',
  };
}

async function main() {
  const effectiveSoftRetries = Math.max(1, retries);
  console.log(`UI SMOKE CONFIG: base=${baseUrl} retries=${effectiveSoftRetries} (configured=${retries}) ci=${Boolean(process.env.CI)}`);

  const browser = await chromium.launch({
    headless: true,
    args: process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
  });
  const results = [];

  for (const path of paths) {
    results.push(await visitPage(browser, path, { retries: effectiveSoftRetries }));
  }

  await browser.close();

  for (const result of results) {
    if (result.outcome !== 'hard-fail') continue;
    if (result.consoleErrors.length) {
      console.log(`consoleErrorSamples=${JSON.stringify(result.consoleErrors.slice(0, 5))}`);
    }
    if (result.requestFailures.length) {
      console.log(`requestFailureSamples=${JSON.stringify(result.requestFailures.slice(0, 5))}`);
    }
    if (result.badResponses.length) {
      console.log(`badResponseSamples=${JSON.stringify(result.badResponses.slice(0, 8))}`);
    }
  }

  const passCount = results.filter((result) => result.outcome === 'pass').length;
  const failCount = results.length - passCount;

  if (failCount === 0) {
    console.log(`UI SMOKE RESULT: PASS (${passCount}/${results.length} pages)`);
    process.exit(0);
  }

  console.log(`UI SMOKE RESULT: FAIL (${passCount} pass, ${failCount} fail)`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
