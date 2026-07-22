import { Account, Transaction, TransactionType } from '../types';

export type DistributionMethod = 'CAPITAL_RATIO' | 'CUSTOM_RATIO' | 'FIXED_AMOUNT';
export type SettlementNegativePolicy = 'BLOCK_NEGATIVE' | 'LIMIT_NEGATIVE';

export interface DistributionPartnerInput {
  partnerId: string;
  partnerName: string;
  currentAccountId: string;
  capital: number;
}

export interface DistributionAllocation {
  partnerId: string;
  partnerName: string;
  currentAccountId: string;
  percent: number;
  amount: number;
}

export interface ProfitDistributionDraftInput {
  date: string;
  periodLabel: string;
  totalProfit: number;
  method: DistributionMethod;
  sourceAccountId: string;
  partners: DistributionPartnerInput[];
  currency: string;
  customRatios?: Record<string, number>;
  fixedAmounts?: Record<string, number>;
  reference?: string;
  note?: string;
}

export type DistributionDraftResult =
  | {
      ok: true;
      allocations: DistributionAllocation[];
      totalAllocated: number;
      remainder: number;
      postings: Omit<Transaction, 'id'>[];
    }
  | {
      ok: false;
      message: string;
    };

export type SettlementValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export interface EquitySettlementValidationInput {
  amount: number;
  debitAccountId: string;
  creditAccountId: string;
  accountsById: Map<string, Account>;
  accountBalanceById: Map<string, number>;
  allowNonEquity: boolean;
  negativePolicy: SettlementNegativePolicy;
  creditLimit?: number;
}

export const roundMoney = (value: number): number => Number((value || 0).toFixed(2));

export const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());

export const isPostedTransaction = (tx: Transaction): boolean => tx.status !== 'DRAFT' && tx.isReversal !== true;

export const buildAccountBalanceMap = (transactions: Transaction[]): Map<string, number> => {
  const map = new Map<string, number>();
  transactions.forEach(tx => {
    if (!isPostedTransaction(tx)) return;
    if (tx.creditAccountId) {
      map.set(tx.creditAccountId, roundMoney((map.get(tx.creditAccountId) || 0) + tx.amount));
    }
    if (tx.debitAccountId) {
      map.set(tx.debitAccountId, roundMoney((map.get(tx.debitAccountId) || 0) - tx.amount));
    }
  });
  return map;
};



export const createPartnerCapitalPosting = (input: {
  amount: number;
  date: string;
  fundingAccountId: string;
  partnerCapitalAccountId: string;
  partnerId: string;
  partnerName: string;
  currency: string;
  note?: string;
}): Omit<Transaction, 'id'> => ({
  amount: roundMoney(input.amount),
  description: `Partner capital contribution - ${input.partnerName}${input.note ? ` - ${input.note}` : ''}`,
  category: 'partner_capital',
  type: TransactionType.TRANSFER,
  date: input.date,
  debitAccountId: input.fundingAccountId,
  creditAccountId: input.partnerCapitalAccountId,
  contactId: input.partnerId,
  currency: input.currency,
  exchangeRate: 1,
  status: 'POSTED'
});

export const createPartnerDrawingsClosePosting = (input: {
  amount: number;
  date: string;
  partnerDrawingsAccountId: string;
  partnerCurrentAccountId: string;
  partnerId: string;
  partnerName: string;
  currency: string;
  reference?: string;
  note?: string;
}): Omit<Transaction, 'id'> => ({
  amount: roundMoney(input.amount),
  description: `Partner drawings close [${input.reference || 'AUTO'}] - ${input.partnerName}${input.note ? ` - ${input.note}` : ''}`,
  category: 'partner_drawings_period_close',
  type: TransactionType.TRANSFER,
  date: input.date,
  debitAccountId: input.partnerCurrentAccountId,
  creditAccountId: input.partnerDrawingsAccountId,
  contactId: input.partnerId,
  currency: input.currency,
  exchangeRate: 1,
  status: 'POSTED'
});

const allocateByPercent = (
  partners: DistributionPartnerInput[],
  percents: Record<string, number>,
  totalProfit: number
): DistributionAllocation[] => {
  let running = 0;
  return partners.map((partner, index) => {
    const isLast = index === partners.length - 1;
    const percent = Math.max(0, Number(percents[partner.partnerId] || 0));
    const amount = isLast
      ? roundMoney(Math.max(0, totalProfit - running))
      : roundMoney((totalProfit * percent) / 100);
    running = roundMoney(running + amount);
    return {
      partnerId: partner.partnerId,
      partnerName: partner.partnerName,
      currentAccountId: partner.currentAccountId,
      percent: roundMoney(percent),
      amount
    };
  });
};

const allocateByFixedAmounts = (
  partners: DistributionPartnerInput[],
  fixedAmounts: Record<string, number>,
  totalProfit: number
): DistributionAllocation[] => {
  return partners.map(partner => {
    const amount = roundMoney(Math.max(0, Number(fixedAmounts[partner.partnerId] || 0)));
    const percent = totalProfit > 0 ? roundMoney((amount / totalProfit) * 100) : 0;
    return {
      partnerId: partner.partnerId,
      partnerName: partner.partnerName,
      currentAccountId: partner.currentAccountId,
      percent,
      amount
    };
  });
};

export const buildProfitDistributionDraft = (input: ProfitDistributionDraftInput): DistributionDraftResult => {
  const totalProfit = roundMoney(input.totalProfit);
  if (!isIsoDate(input.date)) {
    return { ok: false, message: 'Distribution date is invalid.' };
  }
  if (totalProfit <= 0) {
    return { ok: false, message: 'Total distributable profit must be greater than zero.' };
  }
  if (!input.sourceAccountId) {
    return { ok: false, message: 'Source account is required.' };
  }

  const partners = input.partners
    .filter(p => p.currentAccountId)
    .map(p => ({ ...p, capital: roundMoney(Math.max(0, Number(p.capital || 0))) }));

  if (partners.length === 0) {
    return { ok: false, message: 'No eligible partners with current accounts were found.' };
  }

  let allocations: DistributionAllocation[] = [];

  if (input.method === 'CAPITAL_RATIO') {
    const totalCapital = partners.reduce((sum, partner) => sum + partner.capital, 0);
    if (totalCapital <= 0) {
      return { ok: false, message: 'Capital-based distribution requires positive partner capital balances.' };
    }

    let running = 0;
    allocations = partners.map((partner, index) => {
      const isLast = index === partners.length - 1;
      const amount = isLast
        ? roundMoney(Math.max(0, totalProfit - running))
        : roundMoney((totalProfit * partner.capital) / totalCapital);
      running = roundMoney(running + amount);
      return {
        partnerId: partner.partnerId,
        partnerName: partner.partnerName,
        currentAccountId: partner.currentAccountId,
        percent: roundMoney((partner.capital / totalCapital) * 100),
        amount
      };
    });
  } else if (input.method === 'CUSTOM_RATIO') {
    const ratios = Object.fromEntries(
      partners.map(partner => [partner.partnerId, roundMoney(Math.max(0, Number(input.customRatios?.[partner.partnerId] || 0)))])
    );
    const totalRatio = roundMoney(Object.values(ratios).reduce((sum, ratio) => sum + ratio, 0));
    if (totalRatio <= 0) {
      return { ok: false, message: 'Custom ratio distribution requires at least one positive percentage.' };
    }
    if (totalRatio > 100.0001) {
      return { ok: false, message: 'Custom ratios cannot exceed 100%.' };
    }

    allocations = allocateByPercent(partners, ratios, totalProfit);
  } else {
    const fixedAmounts = Object.fromEntries(
      partners.map(partner => [partner.partnerId, roundMoney(Math.max(0, Number(input.fixedAmounts?.[partner.partnerId] || 0)))])
    );
    allocations = allocateByFixedAmounts(partners, fixedAmounts, totalProfit);
  }

  const totalAllocated = roundMoney(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  if (totalAllocated <= 0) {
    return { ok: false, message: 'Distribution total must be greater than zero.' };
  }
  if (totalAllocated > totalProfit + 0.0001) {
    return { ok: false, message: 'Distributed amount cannot exceed total distributable profit.' };
  }

  const postings = allocations
    .filter(allocation => allocation.amount > 0)
    .map(allocation => ({
      amount: roundMoney(allocation.amount),
      description: `Profit distribution [${input.reference || 'AUTO'}] - ${allocation.partnerName}${input.note ? ` - ${input.note}` : ''}`,
      category: 'partner_profit_distribution',
      type: TransactionType.TRANSFER,
      date: input.date,
      debitAccountId: input.sourceAccountId,
      creditAccountId: allocation.currentAccountId,
      contactId: allocation.partnerId,
      currency: input.currency,
      exchangeRate: 1,
      status: 'POSTED' as const
    }));

  return {
    ok: true,
    allocations,
    postings,
    totalAllocated,
    remainder: roundMoney(totalProfit - totalAllocated)
  };
};

export const validateEquitySettlementInput = (input: EquitySettlementValidationInput): SettlementValidationResult => {
  const amount = roundMoney(input.amount);
  if (amount <= 0) {
    return { ok: false, message: 'Settlement amount must be greater than zero.' };
  }

  if (!input.debitAccountId || !input.creditAccountId) {
    return { ok: false, message: 'Debit and credit accounts are required.' };
  }

  if (input.debitAccountId === input.creditAccountId) {
    return { ok: false, message: 'Debit and credit accounts cannot be the same.' };
  }

  const debitAccount = input.accountsById.get(input.debitAccountId);
  const creditAccount = input.accountsById.get(input.creditAccountId);

  if (!debitAccount || !creditAccount) {
    return { ok: false, message: 'Selected account is not available.' };
  }

  if (debitAccount.isGroup || creditAccount.isGroup) {
    return { ok: false, message: 'Settlement requires posting accounts (not groups).' };
  }

  if (!input.allowNonEquity && (debitAccount.type !== 'EQUITY' || creditAccount.type !== 'EQUITY')) {
    return { ok: false, message: 'Settlement accounts must belong to Equity.' };
  }

  const debitBalance = roundMoney(input.accountBalanceById.get(input.debitAccountId) || 0);
  const projectedBalance = roundMoney(debitBalance - amount);

  if (input.negativePolicy === 'BLOCK_NEGATIVE' && projectedBalance < 0) {
    return { ok: false, message: 'Settlement exceeds debit account balance and would make it negative.' };
  }

  if (input.negativePolicy === 'LIMIT_NEGATIVE') {
    const creditLimit = roundMoney(Math.max(0, Number(input.creditLimit || 0)));
    if (projectedBalance < -creditLimit) {
      return { ok: false, message: 'Settlement exceeds configured negative balance limit.' };
    }
  }

  return { ok: true };
};

export const createEquitySettlementPosting = (input: {
  amount: number;
  date: string;
  debitAccountId: string;
  creditAccountId: string;
  reason: string;
  reference: string;
  currency: string;
  category?: string;
  contactId?: string;
}): Omit<Transaction, 'id'> => ({
  amount: roundMoney(input.amount),
  description: `Equity settlement [${input.reference}] - ${input.reason}`,
  category: input.category || 'equity_settlement',
  type: TransactionType.TRANSFER,
  date: input.date,
  debitAccountId: input.debitAccountId,
  creditAccountId: input.creditAccountId,
  contactId: input.contactId,
  currency: input.currency,
  exchangeRate: 1,
  status: 'POSTED'
});

