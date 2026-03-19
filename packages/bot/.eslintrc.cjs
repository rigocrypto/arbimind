module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  plugins: ['@typescript-eslint'],
  env: {
    node: true,
    es2020: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/naming-convention': [
      'warn',
      {
        selector: 'default',
        format: ['camelCase'],
      },
      {
        selector: 'variable',
        format: ['camelCase', 'UPPER_CASE'],
        leadingUnderscore: 'allow',
      },
      {
        selector: 'typeLike',
        format: ['PascalCase'],
      },
      {
        selector: 'memberLike',
        format: ['camelCase'],
      },
      {
        // Skip naming convention for object literal properties (AI feature data, config keys)
        selector: 'objectLiteralProperty',
        format: null,
      },
      {
        // Allow PascalCase imports (ethers, etc.)
        selector: 'import',
        format: ['camelCase', 'PascalCase'],
      },
      {
        // Allow underscore-prefixed parameters and UPPER_CASE
        selector: 'parameter',
        format: ['camelCase', 'UPPER_CASE'],
        leadingUnderscore: 'allow',
      },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      files: ['src/**/*.test.ts', 'tests/**/*.ts'],
      env: {
        jest: true,
      },
    },
  ],
};
