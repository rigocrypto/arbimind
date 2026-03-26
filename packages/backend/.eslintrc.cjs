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
    '@typescript-eslint/no-explicit-any': [
      'error',
      { ignoreRestArgs: true },
    ],
  },
  overrides: [
    {
      files: ['src/**/*.test.ts', 'tests/**/*.ts'],
      parserOptions: {
        project: null,
      },
      env: {
        jest: true,
      },
    },
  ],
};
