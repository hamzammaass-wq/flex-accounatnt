import { describe, expect, it } from 'vitest';

import { CompanyProfile } from '../../types';
import {
  findCompanyProfileNameConflict,
  resolveCompanyDeletionTarget,
  shouldBootstrapMissingCompanySubscription
} from '../../utils/companyLifecycle';

const buildCompany = (id: string, name: string): CompanyProfile => ({
  id,
  name,
  taxNumber: '',
  address: '',
  phone: '',
  logoUrl: '',
  createdAt: '2026-03-20T00:00:00.000Z',
  trialEndsAt: '2026-04-03T00:00:00.000Z',
  subscriptionStatus: 'TRIAL',
  subscriptionPlan: 'TRIAL',
  subscriptionStartsAt: '2026-03-20T00:00:00.000Z',
  graceDays: 0
});

describe('company lifecycle helpers', () => {
  it('detects duplicate company names after normalization', () => {
    const companies = [
      buildCompany('cmp_1', 'شركة ألف'),
      buildCompany('cmp_2', '  شركة   الف  ')
    ];

    const conflict = findCompanyProfileNameConflict(companies, 'شركة ألف جديدة');
    expect(conflict).toBeUndefined();
    expect(findCompanyProfileNameConflict(companies, 'شركة ألف')?.id).toBe('cmp_1');
    expect(findCompanyProfileNameConflict(companies, 'شركة الف', 'cmp_1')?.id).toBe('cmp_2');
  });

  it('resolves deletion fallback safely', () => {
    const companies = [
      buildCompany('cmp_1', 'Flex Accountant'),
      buildCompany('cmp_2', 'Smart One')
    ];

    const success = resolveCompanyDeletionTarget(companies, 'cmp_1');
    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.target.id).toBe('cmp_1');
      expect(success.fallback.id).toBe('cmp_2');
    }

    expect(resolveCompanyDeletionTarget([buildCompany('cmp_1', 'Flex Accountant')], 'cmp_1')).toMatchObject({
      ok: false,
      reason: 'LAST_COMPANY'
    });
  });

  it('skips subscription bootstrapping for companies being deleted or already removed', () => {
    const companies = [
      buildCompany('cmp_1', 'Flex Accountant'),
      buildCompany('cmp_2', 'Smart One')
    ];

    expect(shouldBootstrapMissingCompanySubscription(companies, 'cmp_1')).toBe(true);
    expect(shouldBootstrapMissingCompanySubscription(companies, 'cmp_1', ['cmp_1'])).toBe(false);
    expect(shouldBootstrapMissingCompanySubscription(companies, 'cmp_missing')).toBe(false);
  });
});
