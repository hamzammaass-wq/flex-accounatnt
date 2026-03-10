# Partner Equity UI Rules

This document defines the expected posting behavior in the `Equity & Partners` and invoice screens.

## 1) Capital Tab

- On partner creation with capital amount:
  - `Dr` selected cash/bank funding account
  - `Cr` partner capital account
- Posting is automatic from the screen using `postPartnerCapitalContribution`.
- Capital edit is permission-gated (`SETTLEMENTS.EDIT` or admin role).

## 2) Partner Current Account Tab

- Display-only summary:
  - capital
  - distributed profit
  - current account balance
  - partner net

## 3) Equity Settlement Tab

- Manual settlement posting remains available.
- Annual settlement grid shows:
  - annual profit
  - annual drawings
  - net current result
- Annual drawings calculation excludes:
  - draft entries
  - annual closing entries (to keep preview stable after posting)

## 4) Partner Drawings on Sales Invoice

For partner contact in sales invoice, user can enable:

- `Treat invoice as partner drawings`

Two posting modes are available:

1. `DIRECT_DRAWINGS`
   - Invoice posts directly to drawings:
   - `Dr partner_drawings / Cr sales (+ Cr VAT output)`

2. `AR_THEN_TRANSFER`
   - Invoice posts normally on A/R first:
   - `Dr receivable / Cr sales (+ Cr VAT output)`
   - then automatic transfer:
   - `Dr partner_drawings / Cr receivable`

Validation:
- Partner drawings invoice must be `CREDIT` payment type.
- Partner drawings invoice must be sales (`INCOME`) and `sales_invoice` category.
