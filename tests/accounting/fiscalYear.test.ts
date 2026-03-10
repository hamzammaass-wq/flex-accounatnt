import { describe, expect, it } from 'vitest';
import { computeOpeningByPolicy, getFiscalYearStart, isReportYearClosed } from '../../utils/fiscalYear';

describe('fiscal year report-close policy', () => {
  it('resets P&L opening at first day of year', () => {
    const opening = computeOpeningByPolicy(
      'EXPENSE',
      '2026-01-01',
      [
        { date: '2025-12-31', debit: 1200, credit: 0 },
        { date: '2026-01-01', debit: 200, credit: 0 }
      ],
      true
    );
    expect(opening).toBe(0);
  });

  it('includes same-year movements before start date for P&L', () => {
    const opening = computeOpeningByPolicy(
      'REVENUE',
      '2026-03-01',
      [
        { date: '2025-12-31', debit: 0, credit: 5000 },
        { date: '2026-01-10', debit: 0, credit: 1000 },
        { date: '2026-02-10', debit: 0, credit: 500 }
      ],
      true
    );
    expect(opening).toBe(1500);
  });

  it('keeps balance-sheet opening cumulative historically', () => {
    const opening = computeOpeningByPolicy(
      'ASSET',
      '2026-01-01',
      [
        { date: '2024-12-31', debit: 2000, credit: 0 },
        { date: '2025-12-31', debit: 1000, credit: 0 }
      ],
      true
    );
    expect(opening).toBe(3000);
  });

  it('identifies closed report-year by end date', () => {
    expect(isReportYearClosed('2025-01-01', '2025-12-31', '2026-02-21')).toBe(true);
    expect(isReportYearClosed(getFiscalYearStart(2026), '2026-12-31', '2026-02-21')).toBe(false);
  });
});
