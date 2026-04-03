import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'dist/**'],
    rules: {
      'react-hooks/static-components': 'off',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/purity': 'error',
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
];

export default config;
