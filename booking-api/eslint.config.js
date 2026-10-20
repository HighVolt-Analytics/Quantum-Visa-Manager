import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules', '__azurite*', '__blobstorage__', '__queuestorage__'] },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
]
