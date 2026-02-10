import { test, expect } from '@playwright/test';

test.describe('Solana Wallet', () => {
  test('loads /solana-wallet and hydrates client chunk', async ({ page }) => {
    test.setTimeout(60_000);

    const res = await page.goto('/solana-wallet', { waitUntil: 'load' });
    expect(res?.status()).toBe(200);

    // SSR anchor exists (sr-only, for E2E)
    await expect(page.getByTestId('solana-wallet-title')).toContainText(/Solana/i);

    // Client chunk mounts (dynamic import + wallet adapter)
    await expect(page.getByTestId('solana-wallet-client')).toBeVisible({
      timeout: 45_000,
    });

    await expect(page).not.toHaveTitle(/error|500/i);
  });
});
