import { AccountType } from '../types';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isIsoDate = (value: string): boolean => ISO_DATE_RE.test(String(value || '').trim());

export const getFiscalYear = (dateIso: string): number => {
  const match = String(dateIso || '').trim().match(ISO_DATE_RE);
  if (!match) return new Date().getFullYear();
  return Number(match[1]);
};

export const getFiscalYearStart = (year: number): string => `${year}-01-01`;

export const getFiscalYearEnd = (year: number): string => `${year}-12-31`;

export const isProfitLossAccount = (accountType: AccountType): boolean =>
  accountType === 'REVENUE' || accountType === 'EXPENSE';

export interface OpeningEntry {
  date: string;
  debit: number;
  credit: number;
}

export const computeOpeningByPolicy = (
  accountType: AccountType,
  startDate: string,
  entries: OpeningEntry[],
  reportYearCloseEnabled = true
): number => {
  if (!isIsoDate(startDate)) return 0;

  const year = getFiscalYear(startDate);
  const fiscalStart = getFiscalYearStart(year);

  const filtered = entries.filter(entry => {
    if (!isIsoDate(entry.date)) return false;
    if (entry.date >= startDate) return false;
    if (reportYearCloseEnabled && isProfitLossAccount(accountType)) {
      return entry.date >= fiscalStart;
    }
    return true;
  });

  const isDebitNature = accountType === 'ASSET' || accountType === 'EXPENSE';
  return filtered.reduce((sum, entry) => {
    const debit = Number(entry.debit) || 0;
    const credit = Number(entry.credit) || 0;
    return sum + (isDebitNature ? (debit - credit) : (credit - debit));
  }, 0);
};

export const isReportYearClosed = (startDate: string, endDate: string, todayIso: string): boolean => {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || !isIsoDate(todayIso)) return false;
  const endYear = getFiscalYear(endDate);
  const todayYear = getFiscalYear(todayIso);
  return endYear < todayYear;
};
