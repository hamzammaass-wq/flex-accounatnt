const fs = require('fs');
const path = 'utils/documentExport.ts';
let code = fs.readFileSync(path, 'utf8');

const startElement = code.indexOf('export const printElementContent = (element: HTMLElement | null, options: PrintElementOptions) => {');
const endElement = code.indexOf('export const printHtmlContent = (html: string, options?: { targetWindow?: Window | null }) => {');

if (startElement !== -1 && endElement !== -1) {
  const replacementElement = `export const printElementContent = (element: HTMLElement | null, options: PrintElementOptions) => {
  if (!element || typeof window === 'undefined') return false;

  if (options.targetWindow && !options.targetWindow.closed) {
    try {
      options.targetWindow.close();
    } catch {}
  }

  const clone = stripInteractiveElements(element);
  expandSnapshotLayout(clone);

  const dir = options.dir || 'rtl';
  const lang = options.lang || (dir === 'rtl' ? 'ar' : 'en');
  const pageOrientation = options.pageOrientation || 'portrait';
  const hasStatementPrintFooter = Boolean(
    clone.classList.contains('statement-classic-sheet') ||
    clone.querySelector('.statement-classic-sheet')
  );
  const stylesMarkup = collectPrintStylesMarkup();

  const containerId = 'smart-print-main-container';
  let container = document.getElementById(containerId);
  if (container) container.remove();

  container = document.createElement('div');
  container.id = containerId;
  container.dir = dir;
  container.lang = lang;

  const printLocale = getStatementPrintLocale(lang);
  const printFooterPageLabel = lang.toLowerCase().startsWith('ar') ? 'الصفحة' : 'Page';
  const printFooterOfLabel = lang.toLowerCase().startsWith('ar') ? 'من' : 'of';
  const printFooterDateLabel = lang.toLowerCase().startsWith('ar') ? 'تاريخ الطباعة' : 'Print Date';
  const pageTopMarginMm = 10;
  const pageBottomMarginMm = hasStatementPrintFooter ? 18 : 10;
  const mmToPx = 3.779527559;

  const statementPrintFooterHtml = hasStatementPrintFooter
    ? \`
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
    </div>\`
    : '';

  const styleEl = document.createElement('style');
  styleEl.textContent = \`
    @media screen {
      #smart-print-main-container { display: none !important; }
    }
    @media print {
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
      .no-print { display: none !important; }
      [data-document-actions], button { display: none !important; }
      .report-header { position: static !important; top: auto !important; backdrop-filter: none !important; }
      .financial-reports-page { max-width: none !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
      .financial-reports-page.statement-report-active .overflow-x-auto:has(table) { overflow: visible !important; }
      .financial-reports-page.statement-report-active table { width: 100% !important; min-width: 0 !important; table-layout: auto !important; }
      .financial-reports-page.statement-report-active table th,
      .financial-reports-page.statement-report-active table td {
        padding: 7px 8px !important; font-size: 11px !important; line-height: 1.45 !important;
        vertical-align: top !important; white-space: normal !important; word-break: break-word !important; overflow-wrap: anywhere !important;
      }
      .financial-reports-page.statement-report-active .statement-report-table { width: 100% !important; min-width: 0 !important; table-layout: fixed !important; }
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(1),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(1) { width: 12% !important; }
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(2),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(2) { width: 48% !important; }
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(3),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(3),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(4),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(4),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(5),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(5) { width: 13.33% !important; }
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(1),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(1) { width: 11% !important; }
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(2),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(2) { width: 53% !important; }
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(3),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(3),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(4),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(4),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(5),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(5) { width: 12% !important; }
      .financial-reports-page.statement-report-active .statement-report-description,
      .financial-reports-page.statement-report-active .statement-operation-details,
      .financial-reports-page.statement-report-active .statement-detail-card,
      .financial-reports-page.statement-report-active .statement-detail-note,
      .financial-reports-page.statement-report-active .statement-line-items { width: 100% !important; max-width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; }
      .statement-ledger-date, .statement-ledger-amount, .statement-ledger-balance, .statement-operation-date, .statement-operation-amount { white-space: nowrap !important; }
      .statement-classic-sheet { margin: 0 !important; padding: 0 !important; box-shadow: none !important; min-height: 0 !important; }
      .statement-classic-header { position: static !important; break-inside: avoid; }
      .statement-classic-footer { break-inside: avoid; }
      .statement-classic-table th { background-color: #f1f5f9 !important; color: #0f172a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .statement-print-footer { position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important; display: block !important; height: 18mm !important; padding-top: 4mm !important; background: white !important; border-top: 1px solid #e2e8f0 !important; z-index: 100 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .statement-print-footer__meta { display: flex !important; justify-content: space-between !important; align-items: center !important; font-family: \${dir === 'rtl' ? "'Tajawal', Arial, sans-serif" : "'Segoe UI', Arial, sans-serif"} !important; font-size: 9px !important; color: #64748b !important; padding: 0 14mm !important; }
      .statement-print-footer__item { display: flex !important; gap: 4px !important; align-items: center !important; }
      .statement-print-footer__label { color: #94a3b8 !important; }
      .statement-print-footer__value { font-weight: 500 !important; color: #475569 !important; }
      .statement-print-footer__counter { display: flex !important; gap: 3px !important; }
      .statement-print-footer__page-current::after { counter-increment: page; content: counter(page); }
      @page { size: \${pageOrientation} A4; margin: \${pageTopMarginMm}mm 14mm \${pageBottomMarginMm}mm; }
    }
  \`;
  container.appendChild(styleEl);

  const stylesDiv = document.createElement('div');
  stylesDiv.innerHTML = stylesMarkup;
  while (stylesDiv.firstChild) {
    container.appendChild(stylesDiv.firstChild);
  }

  const rootDiv = document.createElement('div');
  rootDiv.setAttribute('data-report-print-root', 'true');
  rootDiv.appendChild(clone);
  container.appendChild(rootDiv);

  if (statementPrintFooterHtml) {
    const footerDiv = document.createElement('div');
    footerDiv.innerHTML = statementPrintFooterHtml;
    while (footerDiv.firstChild) {
      container.appendChild(footerDiv.firstChild);
    }
  }

  document.body.appendChild(container);

  const cleanup = () => {
    document.getElementById(containerId)?.remove();
    window.removeEventListener('afterprint', cleanup);
  };

  const doPrint = () => {
    window.addEventListener('afterprint', cleanup);
    window.focus();
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 2000);
    }, 150);
  };

  if (hasStatementPrintFooter) {
    const printDate = new Intl.DateTimeFormat(printLocale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
    container.querySelectorAll('[data-statement-print-date]').forEach(node => { node.textContent = printDate; });

    const pageHeightMm = pageOrientation === 'landscape' ? 210 : 297;
    const topMarginPx = pageTopMarginMm * mmToPx;
    const bottomMarginPx = pageBottomMarginMm * mmToPx;
    
    requestAnimationFrame(() => {
      const originalDisplay = container.style.display;
      container.style.display = 'block';
      
      const bodyStyle = window.getComputedStyle(document.body);
      const bodyPaddingTop = parseFloat(bodyStyle.paddingTop) || 0;
      const bodyPaddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;
      const printableHeight = Math.max(1, (pageHeightMm * mmToPx) - topMarginPx - bottomMarginPx - bodyPaddingTop - bodyPaddingBottom);
      
      const contentHeight = Math.max(
        Math.max(rootDiv.scrollHeight, rootDiv.getBoundingClientRect().height)
      );
      
      const pageCount = Math.max(1, Math.ceil(contentHeight / printableHeight));
      container.querySelectorAll('[data-statement-page-count]').forEach(node => { node.textContent = String(pageCount); });
      
      container.style.display = originalDisplay;
      doPrint();
    });
  } else {
    doPrint();
  }

  return true;
};

`;
  code = code.substring(0, startElement) + replacementElement + code.substring(endElement);
}

const endHtml = code.indexOf('const expandSnapshotLayout = (root: HTMLElement) => {');

if (endElement !== -1 && endHtml !== -1) {
  const replacementHtml = `export const printHtmlContent = (html: string, options?: { targetWindow?: Window | null }) => {
  if (typeof window === 'undefined') return false;

  if (options?.targetWindow && !options.targetWindow.closed) {
    try { options.targetWindow.close(); } catch {}
  }

  const containerId = 'smart-print-main-container';
  let container = document.getElementById(containerId);
  if (container) container.remove();

  container = document.createElement('div');
  container.id = containerId;
  container.className = 'smart-print-main-container';

  const dirMatch = html.match(/dir=['"](rtl|ltr)['"]/i);
  const dir = dirMatch ? dirMatch[1] : 'rtl';
  const langMatch = html.match(/lang=['"]([^'"]+)['"]/i);
  const lang = langMatch ? langMatch[1] : 'ar';
  
  container.dir = dir;
  container.lang = lang;

  const styleEl = document.createElement('style');
  styleEl.innerHTML = \`
    @media screen {
      .smart-print-main-container { display: none !important; }
    }
    @media print {
      body > *:not(.smart-print-main-container):not(script):not(style) {
        display: none !important;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .smart-print-main-container {
        display: block !important;
        width: 100% !important;
        background: #ffffff !important;
      }
    }
  \`;
  container.appendChild(styleEl);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  
  while(wrapper.firstChild) {
    container.appendChild(wrapper.firstChild);
  }

  document.body.appendChild(container);

  const cleanup = () => {
    document.getElementById(containerId)?.remove();
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);

  setTimeout(() => {
    window.focus();
    window.print();
    setTimeout(cleanup, 2000);
  }, 200);

  return true;
};

`;
  code = code.substring(0, code.indexOf('export const printHtmlContent = (html: string, options?: { targetWindow?: Window | null }) => {')) + replacementHtml + code.substring(endHtml);
}

fs.writeFileSync(path, code, 'utf8');
console.log('Successfully updated documentExport.ts');
