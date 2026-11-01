import tsParser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['lib/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module', ecmaVersion: 'latest' },
    },
  },
]
