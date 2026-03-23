import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TYPES_FILE = path.join(PROJECT_ROOT, 'types.ts');

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'src/dataconnect-generated', 'tests']);

const collectSourceFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const normalized = fullPath.replace(/\\/g, '/');
      const excluded = Array.from(EXCLUDED_DIRS).some((segment) => normalized.includes(`/${segment}`));
      if (!excluded) files.push(...collectSourceFiles(fullPath));
      return;
    }
    if (!entry.isFile()) return;
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) return;
    files.push(fullPath);
  });
  return files;
};

describe('settings ghost usage guard', () => {
  const typesSource = fs.readFileSync(TYPES_FILE, 'utf8');
  const companySettingsBlock = typesSource.match(/export interface CompanySettings\s*{([\s\S]*?)^}/m)?.[1] || '';
  const validKeys = new Set(
    Array.from(companySettingsBlock.matchAll(/^\s*([A-Za-z0-9_]+)\??:\s/mg)).map((match) => match[1])
  );

  const sourceFiles = collectSourceFiles(PROJECT_ROOT);

  it('does not reference unknown companySettings fields via dot access', () => {
    const unknownUsages: Array<{ file: string; field: string; line: number }> = [];

    sourceFiles.forEach((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      const lines = source.split(/\r?\n/);

      lines.forEach((line, lineIndex) => {
        const matches = Array.from(line.matchAll(/\bcompanySettings\.([A-Za-z0-9_]+)\b/g));
        matches.forEach((match) => {
          const field = match[1];
          if (!validKeys.has(field)) {
            unknownUsages.push({
              file: path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/'),
              field,
              line: lineIndex + 1
            });
          }
        });
      });
    });

    expect(unknownUsages).toEqual([]);
  });
});
