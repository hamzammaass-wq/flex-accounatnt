import JsBarcode from 'jsbarcode';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildBarcodeSvg = (value: string): string => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value, {
    format: 'CODE128',
    displayValue: true,
    fontSize: 10,
    margin: 0,
    height: 28,
    width: 1.1,
    textMargin: 2,
    background: '#ffffff'
  });
  return svg.outerHTML;
};

export const INVOICE_ITEM_BARCODE_CSS = `
  .item-cell { text-align: right; }
  .item-cell-main { display: block; }
  .barcode-row td {
    background: #f8fafc;
  }
  .barcode-row-cell {
    text-align: right;
  }
  .invoice-item-barcode {
    margin-top: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    max-width: 180px;
    padding: 6px 8px;
    border: 1px solid #dbeafe;
    border-radius: 12px;
    background: #ffffff;
  }
  .invoice-item-barcode svg {
    width: 150px;
    height: auto;
    display: block;
  }
  .invoice-item-barcode-fallback {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
`;

export const buildInvoiceItemBarcodeMarkup = (value: string): string => {
  const normalized = String(value || '').trim();
  if (!normalized || typeof document === 'undefined') return '';

  try {
    return `<div class="invoice-item-barcode" dir="ltr">${buildBarcodeSvg(normalized)}</div>`;
  } catch {
    return `<div class="invoice-item-barcode invoice-item-barcode-fallback" dir="ltr">${escapeHtml(normalized)}</div>`;
  }
};
