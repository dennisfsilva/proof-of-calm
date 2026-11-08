// The minimal ESLint layer (ADR-0025): only what Biome lacks. The React Compiler and hooks rules for
// every React package (the Next.js rules left with Next, ADR-0045 step 6). Formatting, imports and
// everything else are Biome's; type-level checks are tsc's. The TypeScript parser is used for syntax only.
import tsParser from '@typescript-eslint/parser';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/out/**',
    '**/coverage/**',
    '**/storybook-static/**',
    '**/playwright-report/**',
    '**/test-results/**',
    'docs/**',
  ]),
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/app/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
  {
    // docs/ENGINEERING.md §1.2: a number is formatted or read only in the formatting layer. Biome has no
    // rule for a method name, so this one is ESLint's. The core uses big.js's own toFixed and runs no
    // ESLint; its branded decimal types keep a number out of its amounts.
    files: ['apps/**/*.{ts,tsx}', 'packages/app/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    ignores: ['packages/app/src/lib/format/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='toFixed']",
          message: 'Format numbers in packages/app/src/lib/format (docs/ENGINEERING.md §1.2).',
        },
        {
          selector: "CallExpression[callee.name='parseFloat'], MemberExpression[property.name='parseFloat']",
          message: 'Read typed numbers with createNumberInput in packages/app/src/lib/format (ADR-0034).',
        },
      ],
    },
  },
]);
