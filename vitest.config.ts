import { defineConfig } from 'vitest/config';

const junitEnabled = process.env.VITEST_JUNIT === '1';
const junitOutputFile = process.env.VITEST_JUNIT_OUTPUT_FILE || 'artifacts/test-results/vitest.junit.xml';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    reporters: junitEnabled ? ['default', 'junit'] : ['default'],
    outputFile: junitEnabled ? { junit: junitOutputFile } : undefined,
  }
});
