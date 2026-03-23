import { spawn } from 'node:child_process';
import path from 'node:path';

const rootDir = process.cwd();
const nodeBin = process.execPath;
const strictBrowserMode = process.argv.includes('--strict-browser');

const runStep = (title, command, args) =>
  new Promise((resolve, reject) => {
    console.log(`\n[ci:verify] ${title}`);
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        E2E_REQUIRE_BROWSER: strictBrowserMode ? '1' : (process.env.E2E_REQUIRE_BROWSER || '0'),
      },
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`[ci:verify] Step failed: ${title} (exit ${code})`));
    });
  });

const run = async () => {
  const vitestCli = path.join(rootDir, 'node_modules', 'vitest', 'vitest.mjs');
  const viteCli = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

  console.log(`[ci:verify] E2E browser mode: ${strictBrowserMode ? 'strict' : 'fallback-allowed'}`);

  await runStep('Unit tests', nodeBin, [vitestCli, 'run']);
  await runStep('Text integrity check', nodeBin, ['scripts/check-source-mojibake.mjs']);
  await runStep('Build assets sync', nodeBin, ['scripts/sync-brand-icons.mjs']);
  await runStep('Production build', nodeBin, [viteCli, 'build']);
  await runStep('Bundle size check', nodeBin, ['scripts/check-dist-budgets.mjs']);
  await runStep('Smoke E2E', nodeBin, ['scripts/e2e-smoke.mjs']);
  await runStep('Critical E2E flow', nodeBin, ['scripts/e2e-critical-flows.mjs']);

  console.log('\n[ci:verify] All checks passed.');
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
