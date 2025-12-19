import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'test/**',
        '**/*.test.js',
        'migrations/**',
        'start.sh'
      ]
    },
    include: ['test/**/*.test.js'],
    testTimeout: 10000
  }
});
