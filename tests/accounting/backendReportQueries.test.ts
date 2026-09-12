import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const reportsSource = readFileSync(
  resolve(here, '../../backend/src/routes/reports.ts'),
  'utf8'
);

function routeBlock(startMarker: string, endMarker: string) {
  const start = reportsSource.indexOf(startMarker);
  const end = reportsSource.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Unable to locate route block: ${startMarker}`);
  }
  return reportsSource.slice(start, end);
}

const trialBalance = routeBlock("router.get('/trial-balance'", "// 2. Account Statement / Ledger Card");
const ledgerCard = routeBlock("router.get('/ledger-card/:accountId'", "// 3. Contact Statement");
const contactStatement = routeBlock("router.get('/contact-statement/:contactId'", "// 4. Dashboard Summary Stats");

describe('backend financial report SQL guards', () => {
  it('trial balance limits period totals to the selected date range', () => {
    expect(trialBalance).toContain('je.date >= $2 AND je.date <= $3');
    expect(trialBalance).toContain('CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END');
    expect(trialBalance).toContain('CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END');
  });

  it('trial balance excludes DRAFT/non-posted entries from period totals', () => {
    expect(trialBalance).toContain("je.status = 'POSTED'");
    expect(trialBalance).toContain("je2.status = 'POSTED'");
  });

  it('ledger opening balance only includes posted entries before start date', () => {
    expect(ledgerCard).toMatch(/je\.date\s*<\s*\$3\s+AND\s+je\.status\s*=\s*'POSTED'/);
  });

  it('ledger period rows only include posted entries inside selected period', () => {
    expect(ledgerCard).toMatch(
      /je\.date\s*>=\s*\$3\s+AND\s+je\.date\s*<=\s*\$4\s+AND\s+je\.status\s*=\s*'POSTED'/
    );
  });

  it('contact statement excludes DRAFT/non-posted entries', () => {
    expect(contactStatement).toContain("je.status = 'POSTED'");
  });
});
