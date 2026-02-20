import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import stylisticTs from '@stylistic/eslint-plugin-ts'
import path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default [
  {
    ignores: ['dist/', 'lib/', 'node_modules/']
  },
  ...tseslint.configs['flat/recommended'],
  {
    files: ['src/**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint,
      '@stylistic/ts': stylisticTs
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 9,
        sourceType: 'module',
        project: path.join(__dirname, 'tsconfig.json')
      },
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-member-accessibility': ['error', {accessibility: 'no-public'}],
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/array-type': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'camelcase': 'off',
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', {allowExpressions: true}],
      '@typescript-eslint/no-array-constructor': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-extraneous-class': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-qualifier': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/prefer-for-of': 'warn',
      '@typescript-eslint/prefer-function-type': 'warn',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/restrict-plus-operands': 'error',
      'semi': 'off',
      '@stylistic/ts/semi': ['error', 'never'],
      '@stylistic/ts/type-annotation-spacing': 'error',
      '@typescript-eslint/unbound-method': 'error'
    }
  }
]
