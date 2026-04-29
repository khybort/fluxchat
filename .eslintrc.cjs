/* eslint-env node */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },
      node: {
        extensions: ['.ts', '.js'],
      },
    },
  },
  rules: {
    // CLAUDE.md §4 — Coding standards
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

    // CLAUDE.md §20 — Forbidden patterns
    'no-console': 'error',
    'import/no-default-export': 'error',
    'import/no-cycle': 'error',
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-unresolved': 'off',

    // Forbid raw process.env outside src/config/** (allowed via override below)
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "MemberExpression[object.object.name='process'][object.property.name='env']",
        message:
          'Read environment variables through Config singleton, not process.env directly.',
      },
    ],
  },
  overrides: [
    {
      files: ['src/config/**/*.ts', 'src/server.ts', 'tests/**/*.ts'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
    {
      files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/unbound-method': 'off',
        'no-console': 'off',
        'import/no-cycle': 'off',
      },
    },
  ],
  ignorePatterns: [
    'dist',
    'node_modules',
    'coverage',
    'prisma/migrations',
    'frontend',
    '*.cjs',
    'vitest.config.ts',
    '*.config.ts',
    '*.config.js',
  ],
};
