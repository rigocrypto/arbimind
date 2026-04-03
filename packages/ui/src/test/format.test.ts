import { describe, it, expect } from 'vitest';
import {
  formatETH,
  formatUSD,
  formatPercent,
  formatCompact,
  formatGas,
  formatAddress,
  formatTxHash,
} from '../utils/format';

describe('formatETH', () => {
  it('formats a number with 4 decimal places by default', () => {
    expect(formatETH(1.23456789)).toBe('1.2346');
  });
  it('accepts a string value', () => {
    expect(formatETH('0.5')).toBe('0.5000');
  });
  it('returns 0.0000 for NaN', () => {
    expect(formatETH('not-a-number')).toBe('0.0000');
  });
  it('respects custom decimals', () => {
    expect(formatETH(1.5, 2)).toBe('1.50');
  });
});

describe('formatUSD', () => {
  it('formats a positive number as USD currency', () => {
    expect(formatUSD(1234.5)).toBe('$1,234.50');
  });
  it('formats zero', () => {
    expect(formatUSD(0)).toBe('$0.00');
  });
  it('returns $0.00 for NaN input', () => {
    expect(formatUSD('abc')).toBe('$0.00');
  });
});

describe('formatPercent', () => {
  it('adds + sign for positive values', () => {
    expect(formatPercent(5.5)).toBe('+5.50%');
  });
  it('keeps - sign for negative values', () => {
    expect(formatPercent(-3.1)).toBe('-3.10%');
  });
  it('returns 0.00% for NaN', () => {
    expect(formatPercent('bad')).toBe('0.00%');
  });
});

describe('formatCompact', () => {
  it('formats billions', () => {
    expect(formatCompact(2_500_000_000)).toBe('2.50B');
  });
  it('formats millions', () => {
    expect(formatCompact(1_200_000)).toBe('1.20M');
  });
  it('formats thousands', () => {
    expect(formatCompact(45_000)).toBe('45.00K');
  });
  it('formats small numbers as-is', () => {
    expect(formatCompact(123)).toBe('123.00');
  });
});

describe('formatGas', () => {
  it('formats gwei with 0 decimals', () => {
    expect(formatGas(42.7)).toBe('43 Gwei');
  });
  it('returns 0 Gwei for NaN', () => {
    expect(formatGas('bad')).toBe('0 Gwei');
  });
});

describe('formatAddress', () => {
  it('truncates a standard Ethereum address', () => {
    expect(formatAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(
      '0x1234...5678'
    );
  });
  it('returns short strings as-is', () => {
    expect(formatAddress('0x12')).toBe('0x12');
  });
  it('handles empty string', () => {
    expect(formatAddress('')).toBe('');
  });
});

describe('formatTxHash', () => {
  it('truncates with 8 chars on each side', () => {
    const hash = '0x' + 'ab'.repeat(32);
    expect(formatTxHash(hash)).toBe('0xababab...abababab');
  });
});
