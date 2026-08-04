import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'dist/**'],
    rules: {
      'react-hooks/static-components': 'off',
      'react-hooks/set-state-in-effect': 'warn',
      // Promoted from 'warn' to 'error' by #88. The two violations that
      // deferred this (in useBalanceGuard) were resolved by #214, which
      // replaced an `ethBalance?.value` dependency with the whole
      // `ethBalance` object. They were a stale-closure bug, not the
      // intentional subproperty tracking the deferral assumed -- so there is
      // nothing left to exempt, and 'error' prevents the pattern returning.
      'react-hooks/preserve-manual-memoization': 'error',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/purity': 'error',
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
];

export default config;
