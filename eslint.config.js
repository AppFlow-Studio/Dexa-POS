// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // Metro doesn't tree shake: importing a package root evaluates the whole
      // library at startup, on every device.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react-native',
              message:
                "Import icons from '@/lib/icons' — the package root evaluates all ~1,700 icons at startup.",
              allowTypeImports: true,
            },
            {
              name: 'date-fns',
              message:
                "Import each function from its own path, e.g. 'date-fns/format' — the package root evaluates the whole library at startup.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
]);
