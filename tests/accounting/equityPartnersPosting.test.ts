import { describe, expect, it } from 'vitest';
import { Account } from '../../types';
import {
  buildProfitDistributionDraft,
  createPartnerCapitalPosting,
  createPartnerDrawingsClosePosting,
  validateEquitySettlementInput
} from '../../utils/equityPartners';

describe('equity partners posting', () => {
  it('Create Capital => creates correct journal entry', () => {
    const posting = createPartnerCapitalPosting({
      amount: 2500,
      date: '2026-03-02',
      fundingAccountId: 'acc_cash',
      partnerCapitalAccountId: 'acc_partner_capital_p1',
      partnerId: 'p1',
      partnerName: 'Partner One',
      currency: 'ILS'
    });

    expect(posting.category).toBe('partner_capital');
    expect(posting.debitAccountId).toBe('acc_cash');
    expect(posting.creditAccountId).toBe('acc_partner_capital_p1');
    expect(posting.amount).toBe(2500);
    expect(posting.status).toBe('POSTED');
  });

  it('Profit Distribution => correct totals and posting lines', () => {
    const draft = buildProfitDistributionDraft({
      date: '2026-03-02',
      periodLabel: '2025',
      totalProfit: 1000,
      method: 'CAPITAL_RATIO',
      sourceAccountId: 'acc_retained_earnings',
      partners: [
        { partnerId: 'p1', partnerName: 'P1', currentAccountId: 'acc_partner_current_p1', capital: 1000 },
        { partnerId: 'p2', partnerName: 'P2', currentAccountId: 'acc_partner_current_p2', capital: 3000 }
      ],
      currency: 'ILS',
      reference: 'PD-TEST'
    });

    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    expect(draft.totalAllocated).toBe(1000);
    expect(draft.postings).toHaveLength(2);
    expect(draft.postings[0].debitAccountId).toBe('acc_retained_earnings');
    expect(draft.postings[1].debitAccountId).toBe('acc_retained_earnings');
    expect(draft.postings[0].creditAccountId).toBe('acc_partner_current_p1');
    expect(draft.postings[1].creditAccountId).toBe('acc_partner_current_p2');
    expect(draft.postings.reduce((sum, line) => sum + line.amount, 0)).toBe(1000);
  });

  it('Settlement => disallow same account and enforce equity-only', () => {
    const equityAccount: Account = {
      id: 'acc_equity_a',
      code: '331001',
      name: 'Equity A',
      type: 'EQUITY',
      balance: 0,
      currency: 'ILS'
    };
    const assetAccount: Account = {
      id: 'acc_asset_a',
      code: '111001',
      name: 'Asset A',
      type: 'ASSET',
      balance: 0,
      currency: 'ILS'
    };

    const accountsById = new Map<string, Account>([
      [equityAccount.id, equityAccount],
      [assetAccount.id, assetAccount]
    ]);
    const balances = new Map<string, number>([[equityAccount.id, 1000], [assetAccount.id, 1000]]);

    const sameAccount = validateEquitySettlementInput({
      amount: 100,
      debitAccountId: equityAccount.id,
      creditAccountId: equityAccount.id,
      accountsById,
      accountBalanceById: balances,
      allowNonEquity: false,
      negativePolicy: 'BLOCK_NEGATIVE'
    });
    expect(sameAccount.ok).toBe(false);

    const nonEquity = validateEquitySettlementInput({
      amount: 100,
      debitAccountId: assetAccount.id,
      creditAccountId: equityAccount.id,
      accountsById,
      accountBalanceById: balances,
      allowNonEquity: false,
      negativePolicy: 'BLOCK_NEGATIVE'
    });
    expect(nonEquity.ok).toBe(false);
  });

  it('Drawings Close => creates correct closing entry lines', () => {
    const posting = createPartnerDrawingsClosePosting({
      amount: 1200,
      date: '2026-03-31',
      partnerDrawingsAccountId: 'acc_partner_drawings_p1',
      partnerCurrentAccountId: 'acc_partner_current_p1',
      partnerId: 'p1',
      partnerName: 'Partner One',
      currency: 'ILS',
      reference: 'DCL-TEST'
    });

    expect(posting.category).toBe('partner_drawings_period_close');
    expect(posting.debitAccountId).toBe('acc_partner_current_p1');
    expect(posting.creditAccountId).toBe('acc_partner_drawings_p1');
    expect(posting.amount).toBe(1200);
    expect(posting.status).toBe('POSTED');
  });
});

