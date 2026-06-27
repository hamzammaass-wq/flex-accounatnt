const fs = require('fs');
const path = 'utils/documentExport.ts';
let code = fs.readFileSync(path, 'utf8');

const sharedCss = `
      __CONTAINER__ .no-print { display: none !important; }
      __CONTAINER__ [data-document-actions], __CONTAINER__ button { display: none !important; }
      __CONTAINER__ .report-header { position: static !important; top: auto !important; backdrop-filter: none !important; }
      __CONTAINER__ .financial-reports-page { max-width: none !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
      __CONTAINER__ .financial-reports-page.statement-report-active .overflow-x-auto:has(table) { overflow: visible !important; }
      __CONTAINER__ .financial-reports-page.statement-report-active table { width: 100% !important; min-width: 0 !important; table-layout: auto !important; }
      __CONTAINER__ .financial-reports-page.statement-report-active table th,
      __CONTAINER__ .financial-reports-page.statement-report-active table td {
        padding: 7px 8px !important; font-size: 11px !important; line-height: 1.45 !important;
        vertical-align: top !important; white-space: normal !important; word-break: break-word !important; overflow-wrap: anywhere !important;
      }
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table { width: 100% !important; min-width: 0 !important; table-layout: fixed !important; }
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(1),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(1) { width: 12% !important; }
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(2),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(2) { width: 48% !important; }
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(3),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(3),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(4),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(4),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(5),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(5) { width: 13.33% !important; }
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(1),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(1) { width: 11% !important; }
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(2),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(2) { width: 53% !important; }
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(3),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(3),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(4),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(4),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(5),
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(5) { width: 12% !important; }
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-report-description,
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-operation-details,
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-detail-card,
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-detail-note,
      __CONTAINER__ .financial-reports-page.statement-report-active .statement-line-items { width: 100% !important; max-width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; }
      __CONTAINER__ .statement-ledger-date, __CONTAINER__ .statement-ledger-amount, __CONTAINER__ .statement-ledger-balance, __CONTAINER__ .statement-operation-date, __CONTAINER__ .statement-operation-amount { white-space: nowrap !important; }
      __CONTAINER__ .statement-classic-sheet { margin: 0 !important; padding: 0 !important; box-shadow: none !important; min-height: 0 !important; }
      __CONTAINER__ .statement-classic-header { position: static !important; break-inside: avoid; }
      __CONTAINER__ .statement-classic-footer { break-inside: avoid; }
      __CONTAINER__ .statement-classic-table th { background-color: #f1f5f9 !important; color: #0f172a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

const getFooterMarkup = `
  const printLocale = getStatementPrintLocale(lang);
  const printFooterPageLabel = lang.toLowerCase().startsWith('ar') ? 'الصفحة' : 'Page';
  const printFooterOfLabel = lang.toLowerCase().startsWith('ar') ? 'من' : 'of';
  const printFooterDateLabel = lang.toLowerCase().startsWith('ar') ? 'تاريخ الطباعة' : 'Print Date';

  const statementPrintFooterHtml = \`
    <div class="statement-print-footer" aria-hidden="true">
      <div class="statement-print-footer__meta">
        <span class="statement-print-footer__item">
          <span class="statement-print-footer__label">\${printFooterDateLabel}</span>
          <span class="statement-print-footer__value" data-statement-print-date></span>
        </span>
        <span class="statement-print-footer__item">
          <span class="statement-print-footer__label">\${printFooterPageLabel}</span>
          <span class="statement-print-footer__counter">
            <span class="statement-print-footer__value statement-print-footer__page-current"></span>
            <span class="statement-print-footer__label">\${printFooterOfLabel}</span>
            <span class="statement-print-footer__value" data-statement-page-count>1</span>
          </span>
        </span>
      </div>
    </div>\`;
`;

let newCode = code;

if (!newCode.includes('const SHARED_STATEMENT_PRINT_CSS')) {
  const insertIndex = newCode.indexOf('const updateStatementFooterMeta');
  newCode = newCode.slice(0, insertIndex) + 
    'const SHARED_STATEMENT_PRINT_CSS = `' + sharedCss.trim() + '`;\n\n' +
    'const getStatementPrintFooterHtml = (lang: string) => {\n' + getFooterMarkup + '\n  return statementPrintFooterHtml;\n};\n\n' +
    newCode.slice(insertIndex);
}

// Replace printElementContent's hardcoded CSS with SHARED_STATEMENT_PRINT_CSS
const printRegex = /const statementPrintFooterHtml = hasStatementPrintFooter[\s\S]*?(const styleEl = document\.createElement\('style'\);)/;
newCode = newCode.replace(printRegex, `
  const statementPrintFooterHtml = hasStatementPrintFooter
    ? getStatementPrintFooterHtml(lang)
    : '';

  $1
`);

const printCssRegex = /<style>[\s\S]*?#smart-print-main-container \{ display: none !important; \} \}[\s\S]*?@media print \{([\s\S]*?)\.statement-print-footer \{[\s\S]*?counter\(page\); \}[\s\S]*?@page \{[\s\S]*?\}[\s\S]*?\}/;
// Actually, it is styleEl.textContent = ` ... `;
const styleElRegex = /styleEl\.textContent = `[\s\S]*?@page \{[^}]*\}\s*\n\s*\}\s*`;/;

newCode = newCode.replace(styleElRegex, `styleEl.textContent = \`
    @media screen {
      #smart-print-main-container { display: none !important; }
    }
    @media print {
      html, body {
        height: auto !important;
        min-height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }
      body > *:not(#smart-print-main-container):not(script):not(style) {
        display: none !important;
      }
      body {
        font-family: \${dir === 'rtl' ? "'Tajawal', Arial, sans-serif" : "'Segoe UI', Arial, sans-serif"} !important;
        margin: 0 !important;
        padding: 24px !important;
        background: #ffffff !important;
        color: #0f172a !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      #smart-print-main-container {
        display: block !important;
        width: 100% !important;
      }
      \${SHARED_STATEMENT_PRINT_CSS.replace(/__CONTAINER__/g, '')}
      .statement-print-footer { position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important; display: block !important; height: 18mm !important; padding-top: 4mm !important; background: white !important; border-top: 1px solid #e2e8f0 !important; z-index: 100 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .statement-print-footer__meta { display: flex !important; justify-content: space-between !important; align-items: center !important; font-family: \${dir === 'rtl' ? "'Tajawal', Arial, sans-serif" : "'Segoe UI', Arial, sans-serif"} !important; font-size: 9px !important; color: #64748b !important; padding: 0 14mm !important; }
      .statement-print-footer__item { display: flex !important; gap: 4px !important; align-items: center !important; }
      .statement-print-footer__label { color: #94a3b8 !important; }
      .statement-print-footer__value { font-weight: 500 !important; color: #475569 !important; }
      .statement-print-footer__counter { display: flex !important; gap: 3px !important; }
      .statement-print-footer__page-current::after { counter-increment: page; content: counter(page); }
      @page { size: \${pageOrientation} A4; margin: \${pageTopMarginMm}mm 14mm \${pageBottomMarginMm}mm; }
    }
  \`;`);

// Replace classicOverrides in prepareSnapshotHost
const classicOverridesRegex = /const classicOverrides = hasClassicStatementLayout\s*\?\s*`[\s\S]*?`\s*:\s*'';/;
newCode = newCode.replace(classicOverridesRegex, `const classicOverrides = hasClassicStatementLayout ? SHARED_STATEMENT_PRINT_CSS.replace(/__CONTAINER__/g, 'body .pdf-export-host') : '';`);

// Modify buildElementPdfFile to inject and update the footer
const buildPdfRegex = /const estimatedPageCount = Math\.max\(1, Math\.ceil\(totalHeight \/ pageSliceHeight\)\);/;
newCode = newCode.replace(buildPdfRegex, `const estimatedPageCount = Math.max(1, Math.ceil(totalHeight / pageSliceHeight));

    let footerOverlay: HTMLElement | null = null;
    const isStatementPrint = clone.classList.contains('statement-classic-sheet') || clone.querySelector('.statement-classic-sheet');
    if (isStatementPrint) {
        const footerHtml = getStatementPrintFooterHtml(options.lang || 'ar');
        footerOverlay = document.createElement('div');
        footerOverlay.innerHTML = footerHtml;
        footerOverlay.style.position = 'absolute';
        footerOverlay.style.bottom = '0';
        footerOverlay.style.left = '0';
        footerOverlay.style.right = '0';
        footerOverlay.style.width = '100%';
        footerOverlay.style.zIndex = '99999';
        viewport.appendChild(footerOverlay);
        
        // Ensure footer styles match print exactly in PDF (since we don't have media print block)
        const footerStyle = document.createElement('style');
        footerStyle.textContent = \`
          .pdf-export-host .statement-print-footer { position: absolute !important; bottom: 0 !important; left: 0 !important; right: 0 !important; display: block !important; height: 18mm !important; padding-top: 4mm !important; background: white !important; border-top: 1px solid #e2e8f0 !important; z-index: 100 !important; }
          .pdf-export-host .statement-print-footer__meta { display: flex !important; justify-content: space-between !important; align-items: center !important; font-family: \${options.lang?.startsWith('en') ? "'Segoe UI', Arial, sans-serif" : "'Tajawal', Arial, sans-serif"} !important; font-size: 9px !important; color: #64748b !important; padding: 0 14mm !important; }
          .pdf-export-host .statement-print-footer__item { display: flex !important; gap: 4px !important; align-items: center !important; }
          .pdf-export-host .statement-print-footer__label { color: #94a3b8 !important; }
          .pdf-export-host .statement-print-footer__value { font-weight: 500 !important; color: #475569 !important; }
          .pdf-export-host .statement-print-footer__counter { display: flex !important; gap: 3px !important; }
        \`;
        host.appendChild(footerStyle);
        
        updateStatementFooterMeta(footerOverlay, {
          printDate: formatStatementPrintDate(options.lang || 'ar'),
          pageCount: estimatedPageCount
        });
    }`);

const whileRegex = /while \(renderedHeight < totalHeight\) \{/;
newCode = newCode.replace(whileRegex, `while (renderedHeight < totalHeight) {
      if (footerOverlay) {
        const currentPageElem = footerOverlay.querySelector('.statement-print-footer__page-current');
        if (currentPageElem) {
          currentPageElem.textContent = String(pageIndex + 1);
        }
      }`);

fs.writeFileSync(path, newCode);
