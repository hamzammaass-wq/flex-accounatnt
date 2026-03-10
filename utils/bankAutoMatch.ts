import { BankMatchSuggestion } from '../types';

export interface MatchCandidate {
  transactionId: string;
  date: string;
  amount: number;
  reference?: string;
  counterparty?: string;
  description?: string;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const dayDiff = (a: string, b: string): number => {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 30;
  const ms = Math.abs(da.getTime() - db.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

export const buildBankMatchSuggestions = (
  pendingRows: MatchCandidate[],
  statementDate: string
): BankMatchSuggestion[] => {
  return pendingRows
    .map((row, index) => {
      let score = 0;
      const reasons: string[] = [];
      const absAmount = Math.abs(Number(row.amount) || 0);

      if (absAmount > 0) {
        score += 40;
        reasons.push('Amount available');
      }

      const days = dayDiff(row.date, statementDate);
      const dateScore = clamp(30 - days, 0, 30);
      score += dateScore;
      if (dateScore > 0) reasons.push(`Date proximity (${days}d)`);

      if (row.reference && row.reference.trim()) {
        score += 15;
        reasons.push('Reference found');
      }

      if (row.counterparty && row.counterparty.trim()) {
        score += 10;
        reasons.push('Counterparty linked');
      }

      if (row.description && row.description.trim().length >= 8) {
        score += 5;
        reasons.push('Descriptive line');
      }

      return {
        id: `sugg_${index}_${row.transactionId}`,
        transactionId: row.transactionId,
        confidence: clamp(Math.round(score), 0, 100),
        reason: reasons.join(', ')
      };
    })
    .filter(s => s.confidence >= 45)
    .sort((a, b) => b.confidence - a.confidence);
};
