export type DrilldownTarget =
  | { kind: 'ACCOUNT_LEDGER'; accountId: string }
  | { kind: 'CONTACT_STATEMENT'; contactId: string }
  | { kind: 'PRODUCT_MOVEMENT'; productId: string }
  | { kind: 'EDIT_TRANSACTION'; mode: any; invoiceId?: string; voucherId?: string; voucherType?: 'RECEIPT' | 'PAYMENT' };

export const DRILLDOWN_EVENT_NAME = 'smart-account:drilldown';

const DRILLDOWN_STORAGE_KEY = 'smart-account:pending-drilldown';

export const openDrilldown = (target: DrilldownTarget): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DRILLDOWN_STORAGE_KEY, JSON.stringify(target));
  } catch {
    // Ignore storage write failures and rely on the live event only.
  }
  window.dispatchEvent(new CustomEvent<DrilldownTarget>(DRILLDOWN_EVENT_NAME, { detail: target }));
};

export const consumePendingDrilldown = (): DrilldownTarget | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DRILLDOWN_STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(DRILLDOWN_STORAGE_KEY);
    return JSON.parse(raw) as DrilldownTarget;
  } catch {
    return null;
  }
};

export const clearPendingDrilldown = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(DRILLDOWN_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
};
