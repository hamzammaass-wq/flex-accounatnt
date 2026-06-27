import JsBarcode from 'jsbarcode';
import type { Product } from '../types';
import type { BarcodeReaderSettings } from './barcodeSettings';
import { appendDeviceHubLog } from './deviceHub';

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildBarcodeSvg = (value: string, fontSize = 13): string => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value, {
    format: 'CODE128',
    displayValue: true,
    fontSize,
    margin: 0,
    height: 38,
    width: 1.4,
    textMargin: 2,
    background: '#ffffff'
  });
  return svg.outerHTML;
};

export const printProductBarcodeLabel = (params: {
  product: Product;
  settings: BarcodeReaderSettings;
  companyId?: string | null;
  deviceId?: string;
  currency?: string;
  isEnglish?: boolean;
  copies?: number;
}) => {
  const { product, settings, companyId, deviceId, currency = '', copies, isEnglish = false } = params;
  const code = String(product.barcode || product.itemCode || '').trim();
  if (!code) {
    alert(isEnglish ? 'This item has no barcode or item code to print.' : 'هذا الصنف لا يحتوي باركود أو رمز صنف للطباعة.');
    appendDeviceHubLog(companyId, {
      deviceId,
      deviceType: 'LABEL_PRINTER',
      action: 'PRINT_LABEL',
      status: 'ERROR',
      message: 'Print label failed: missing barcode/item code',
      metadata: { productId: product.id, itemCode: product.itemCode || null }
    });
    return;
  }

  const copiesCount = Math.max(1, Math.min(50, Math.round(Number(copies || settings.labelCopiesDefault || 1))));
  const svg = buildBarcodeSvg(code, settings.barcodeFontSize);
  const width = Math.max(25, settings.labelWidthMm || 58);
  const height = Math.max(15, settings.labelHeightMm || 35);
  const productName = product.name || '';
  const priceText = Number.isFinite(Number(product.sellPrice))
    ? `${Number(product.sellPrice).toLocaleString('en-US')} ${currency}`.trim()
    : '';

  const labels = Array.from({ length: copiesCount }).map(() => `
    <div class="label">
      ${settings.labelShowItemName ? `<div class="name">${esc(productName)}</div>` : ''}
      <div class="barcode">${svg}</div>
      ${settings.labelShowPrice && priceText ? `<div class="price">${esc(priceText)}</div>` : ''}
    </div>
  `).join('');

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert(isEnglish ? 'Pop-up blocked. Please allow pop-ups.' : 'تم حظر نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.');
    appendDeviceHubLog(companyId, {
      deviceId,
      deviceType: 'LABEL_PRINTER',
      action: 'PRINT_LABEL',
      status: 'ERROR',
      message: 'Print label failed: popup blocked',
      metadata: { productId: product.id, code }
    });
    return;
  }

  appendDeviceHubLog(companyId, {
    deviceId,
    deviceType: 'LABEL_PRINTER',
    action: 'PRINT_LABEL',
    status: 'SUCCESS',
    message: 'Label print window opened',
    metadata: { productId: product.id, code, copies: copiesCount }
  });

  const title = isEnglish ? 'Product Barcode Label' : 'ملصق باركود الصنف';
  win.document.open();
  win.document.write(`<!doctype html>
<html lang="${isEnglish ? 'en' : 'ar'}" dir="${isEnglish ? 'ltr' : 'rtl'}">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: ${width}mm ${height}mm; margin: 2mm; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#fff; font-family: Tahoma, Arial, sans-serif; }
  body { padding: 2mm; }
  .sheet { display:grid; grid-template-columns: 1fr; gap:2mm; }
  .label {
    width:${width - 4}mm;
    min-height:${height - 4}mm;
    border:1px dashed #ddd;
    border-radius:2mm;
    padding:2mm;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    overflow:hidden;
    page-break-inside: avoid;
  }
  .name { font-weight:700; font-size:3.2mm; line-height:1.2; text-align:center; margin-bottom:1mm; max-width:100%; }
  .barcode { width:100%; display:flex; justify-content:center; align-items:center; }
  .barcode svg { width:100%; height:auto; }
  .price { font-weight:800; font-size:3.4mm; margin-top:1mm; }
</style>
</head>
<body>
  <div class="sheet">${labels}</div>
  <script>window.focus(); setTimeout(() => window.print(), 120);</script>
</body>
</html>`);
  win.document.close();
};
