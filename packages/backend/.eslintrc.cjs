module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.json'],
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2022: true,
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
        // Skip naming convention for object literal properties (DB schemas, config keys)
        selector: 'objectLiteralProperty',
        format: null,
      },
      {
        // Skip naming for type properties (DB schema fields are often snake_case)
        selector: 'typeProperty',
        format: null,
      },
      {
        // Allow PascalCase imports (Joi, Sentry, etc.)
        selector: 'import',
        format: ['camelCase', 'PascalCase'],
      },
      {
        // Allow underscore-prefixed and UPPER_CASE parameters
        selector: 'parameter',
        format: ['camelCase', 'UPPER_CASE'],
        leadingUnderscore: 'allow',
      },
    ],
    // Relax 'any' enforcement for backend where type information may not be available
    // (dynamic external data, third-party APIs, legacy integrations)
    '@typescript-eslint/no-explicit-any': [
      'warn',
      { ignoreRestArgs: true },
    ],
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
