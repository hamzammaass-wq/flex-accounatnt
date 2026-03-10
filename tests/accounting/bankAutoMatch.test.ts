import { describe, expect, it } from 'vitest';
import { buildBankMatchSuggestions } from '../../utils/bankAutoMatch';

describe('bank auto-match suggestions', () => {
  it('returns sorted suggestions with confidence score', () => {
    const suggestions = buildBankMatchSuggestions(
      [
        {
          transactionId: 'tx1',
          date: '2026-02-20',
          amount: 300,
          reference: 'RV-1001',
          counterparty: 'Client A',
          description: 'Receipt voucher'
        },
        {
          transactionId: 'tx2',
          date: '2026-01-01',
          amount: 0,
          description: 'Weak row'
        }
      ],
      '2026-02-21'
    );

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].transactionId).toBe('tx1');
    expect(suggestions[0].confidence).toBeGreaterThanOrEqual(45);
  });
});
