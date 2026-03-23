import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const nodeBin = process.execPath;
const artifactsRoot = process.env.E2E_ARTIFACTS_DIR
  ? path.resolve(rootDir, process.env.E2E_ARTIFACTS_DIR, 'flake-guard')
  : null;

const toSafeInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const smokeIterations = toSafeInt(process.env.FLAKE_GUARD_SMOKE_RUNS, 3);
const criticalIterations = toSafeInt(process.env.FLAKE_GUARD_CRITICAL_RUNS, 3);

const ensureArtifactsDir = async () => {
  if (!artifactsRoot) return null;
  await fs.mkdir(artifactsRoot, { recursive: true });
  return artifactsRoot;
};

const writeSummaryFiles = async (summary) => {
  const dir = await ensureArtifactsDir();
  if (!dir) return;

  await fs.writeFile(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  const lines = [
    '# Flake Guard Summary',
    '',
    `- Status: ${summary.status}`,
    `- Started At: ${summary.startedAt}`,
    `- Finished At: ${summary.finishedAt}`,
    `- Smoke Runs Requested: ${summary.smokeRuns}`,
    `- Critical Runs Requested: ${summary.criticalRuns}`,
  ];

  if (summary.failedStep) {
    lines.push(`- Failed Step: ${summary.failedStep}`);
    lines.push(`- Error: ${summary.error}`);
  }

  lines.push('', '## Executions', '');

  for (const run of [...summary.results.smoke, ...summary.results.critical]) {
    lines.push(`- ${run.label}: ${run.status} (${run.durationMs}ms)`);
  }

  await fs.writeFile(path.join(dir, 'summary.md'), `${lines.join('\n')}\n`, 'utf8');
};

const runStep = (title, args) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    console.log(`\n[flake:guard] ${title}`);
    const child = spawn(nodeBin, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        E2E_REQUIRE_BROWSER: '1',
      },
    });

    child.on('error', (error) => {
      const wrappedError = error instanceof Error ? error : new Error(String(error));
      wrappedError.flakeRun = {
        label: title,
        status: 'failed',
        durationMs: Date.now() - startedAt,
      };
      reject(wrappedError);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          label: title,
          status: 'passed',
          durationMs: Date.now() - startedAt,
        });
        return;
      }
      const error = new Error(`[flake:guard] Step failed: ${title} (exit ${code})`);
      error.flakeRun = {
        label: title,
        status: 'failed',
        durationMs: Date.now() - startedAt,
      };
      reject(error);
    });
  });

const repeat = async (label, iterations, args) => {
  const runs = [];
  for (let index = 1; index <= iterations; index += 1) {
    try {
      runs.push(await runStep(`${label} ${index}/${iterations}`, args));
    } catch (error) {
      if (error?.flakeRun) {
        runs.push(error.flakeRun);
      }
      error.partialRuns = runs;
      throw error;
    }
  }
  return runs;
};

const run = async () => {
  const summary = {
    status: 'passed',
    startedAt: new Date().toISOString(),
    finishedAt: '',
    smokeRuns: smokeIterations,
    criticalRuns: criticalIterations,
    failedStep: '',
    error: '',
    results: {
      smoke: [],
      critical: [],
    },
  };

  try {
    console.log(`[flake:guard] smoke runs=${smokeIterations}, critical runs=${criticalIterations}`);
    summary.results.smoke = await repeat('Smoke strict', smokeIterations, ['scripts/e2e-smoke.mjs', '--require-browser']);
    summary.results.critical = await repeat('Critical strict', criticalIterations, ['scripts/e2e-critical-flows.mjs', '--require-browser']);
    console.log('\n[flake:guard] All repeated E2E checks passed.');
  } catch (error) {
    summary.status = 'failed';
    summary.error = error instanceof Error ? error.message : String(error);
    summary.failedStep = summary.error.replace('[flake:guard] Step failed: ', '');
    if (Array.isArray(error?.partialRuns)) {
      if (summary.results.smoke.length === 0) {
        summary.results.smoke = error.partialRuns;
      } else {
        summary.results.critical = error.partialRuns;
      }
    }
    throw error;
  } finally {
    summary.finishedAt = new Date().toISOString();
    await writeSummaryFiles(summary);
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});