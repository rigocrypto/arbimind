import { describe, expect, it } from 'vitest';
import { getIdentitySource, shortAddress } from '../../src/config/identity';

describe('getIdentitySource', () => {
  it('returns private_key when wallet exists', () => {
    expect(getIdentitySource({ hasWallet: true })).toBe('private_key');
  });

  it('returns wallet_address_env when no wallet but walletAddress provided', () => {
    expect(getIdentitySource({ hasWallet: false, walletAddress: '0xabc' })).toBe('wallet_address_env');
  });

  it('returns none when no wallet and no walletAddress', () => {
    expect(getIdentitySource({ hasWallet: false })).toBe('none');
  });
});

describe('shortAddress', () => {
  it('shortens long EVM addresses', () => {
    expect(shortAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')).toBe('0xf39F…2266');
  });

  it('shortens long non-EVM addresses', () => {
    expect(shortAddress('9WzD9v7oVq6m8x3L1k2pQ7rT8uY4KpQ')).toBe('9WzD9v…4KpQ');
  });

  it('returns empty for blank address', () => {
    expect(shortAddress('   ')).toBe('');
  });
});
