import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

interface HtmlSnapshotOptions {
  title: string;
  fileName: string;
  dir?: 'rtl' | 'ltr';
  lang?: string;
}

interface PrintElementOptions {
  title: string;
  dir?: 'rtl' | 'ltr';
  lang?: string;
  autoCloseAfterPrint?: boolean;
  pageOrientation?: 'portrait' | 'landscape';
  targetWindow?: Window | null;
}

interface PdfSnapshotOptions extends HtmlSnapshotOptions {
  padding?: number;
  backgroundColor?: string;
  canvasScale?: number;
  orientation?: 'portrait' | 'landscape';
  minRenderWidth?: number;
  maxRenderWidth?: number;
}

interface WorkbookDownloadOptions {
  fileName: string;
  bookType?: XLSX.BookType;
  mimeType?: string;
}

const INVALID_FILE_CHARS = /[\\/:*?"<>|]+/g;

export const sanitizeDownloadName = (value: string, fallback = 'document') => {
  const safe = value
    .replace(INVALID_FILE_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return safe || fallback;
};

const triggerDownload = (blob: Blob, fileName: string) => {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = sanitizeDownloadName(fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
};

export const downloadBlobFile = (blob: Blob, fileName: string) => {
  triggerDownload(blob, fileName);
};

export const downloadWorkbookFile = (
  workbook: XLSX.WorkBook,
  { fileName, bookType = 'xlsx', mimeType }: WorkbookDownloadOptions
) => {
  const finalFileName = sanitizeDownloadName(
    fileName.endsWith(`.${bookType}`) ? fileName : `${fileName}.${bookType}`
  );
  const output = XLSX.write(workbook, {
    bookType,
    type: 'array',
    compression: true
  });
  const resolvedMimeType = mimeType || (
    bookType === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/octet-stream'
  );
  downloadBlobFile(new Blob([output], { type: resolvedMimeType }), finalFileName);
};

export const downloadTextFile = (content: string, fileName: string, mimeType = 'text/plain;charset=utf-8') => {
  triggerDownload(new Blob([content], { type: mimeType }), fileName);
};

const waitForRenderPass = (frames = 1, fallbackMs = 100) => new Promise<void>(resolve => {
  if (typeof window === 'undefined') {
    resolve();
    return;
  }

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    resolve();
  };

  const timeoutId = window.setTimeout(finish, fallbackMs);
  const visibilityState = typeof document === 'undefined' ? 'visible' : document.visibilityState;
  if (visibilityState === 'hidden') {
    return;
  }

  const step = (remaining: number) => {
    window.requestAnimationFrame(() => {
      if (remaining <= 1) {
        window.clearTimeout(timeoutId);
        finish();
        return;
      }
      step(remaining - 1);
    });
  };

  step(Math.max(1, frames));
});

export const settleElementBeforeSnapshot = async (element: HTMLElement | null) => {
  if (!element || typeof window === 'undefined' || typeof document === 'undefined') return;

  const activeElement = document.activeElement as HTMLElement | null;
  if (activeElement && element.contains(activeElement) && typeof activeElement.blur === 'function') {
    activeElement.blur();
  }

  await new Promise<void>(resolve => window.setTimeout(resolve, 0));
  await waitForRenderPass(1, 120);
};

const normalizeText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
const MM_TO_PX = 96 / 25.4;

const getStatementPrintLocale = (lang: string) => (
  lang.toLowerCase().startsWith('ar') ? 'ar-EG-u-nu-latn' : 'en-GB'
);

const formatStatementPrintDate = (lang: string) => new Intl.DateTimeFormat(getStatementPrintLocale(lang), {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
}).format(new Date());

const updateStatementFooterMeta = (
  root: ParentNode,
  meta: {
    printDate?: string;
    pageCount?: number;
  }
) => {
  if (meta.printDate) {
    root.querySelectorAll('[data-statement-print-date]').forEach(node => {
      node.textContent = meta.printDate as string;
    });
  }

  if (typeof meta.pageCount === 'number') {
    const pageCountText = String(Math.max(1, meta.pageCount));
    root.querySelectorAll('[data-statement-page-count]').forEach(node => {
      node.textContent = pageCountText;
    });
  }
};

const collectPrintStylesMarkup = () => {
  if (typeof document === 'undefined') return '';
  return Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(node => node.outerHTML)
    .join('\n');
};

const shouldRemoveFormControl = (node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
  if (node instanceof HTMLInputElement && node.type === 'hidden') return true;
  if (node.getAttribute('aria-hidden') === 'true') return true;
  const className = typeof node.className === 'string' ? node.className : '';
  const isVisuallyHidden = /(?:opacity-0|pointer-events-none|h-px|w-px|sr-only)/.test(className);
  return node.tabIndex === -1 && isVisuallyHidden;
};

const stripInteractiveElements = (element: HTMLElement) => {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-document-actions], script, button').forEach(node => node.remove());
  clone.querySelectorAll('input, textarea, select').forEach(node => {
    if (
      (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) &&
      shouldRemoveFormControl(node)
    ) {
      node.remove();
      return;
    }

    const replacement = document.createElement('span');
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      replacement.textContent = node.value || node.placeholder || '';
    } else if (node instanceof HTMLSelectElement) {
      replacement.textContent = node.selectedOptions[0]?.textContent || '';
    }
    if (!replacement.textContent?.trim()) {
      node.remove();
      return;
    }
    replacement.className = 'inline-block min-h-[1em]';
    node.replaceWith(replacement);
  });
  return clone;
};

const BLOCK_TEXT_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TBODY',
  'TD',
  'TH',
  'THEAD',
  'TR',
  'UL'
]);

const extractReadableText = (node: Node | null | undefined): string => {
  if (!node) return '';

  const parts: string[] = [];
  const appendBreak = () => {
    const last = parts[parts.length - 1];
    if (last !== '\n') {
      parts.push('\n');
    }
  };

  const walk = (current: Node) => {
    if (current.nodeType === Node.TEXT_NODE) {
      parts.push(current.textContent || '');
      return;
    }

    if (!(current instanceof HTMLElement)) return;

    if (current.tagName === 'BR') {
      appendBreak();
      return;
    }

    const isBlock = BLOCK_TEXT_TAGS.has(current.tagName);
    if (isBlock && parts.length > 0) {
      appendBreak();
    }

    current.childNodes.forEach(walk);

    if (isBlock) {
      appendBreak();
    }
  };

  walk(node);

  return parts
    .join('')
    .replace(/\u00A0/g, ' ')
    .split(/\r?\n/)
    .map(line => normalizeText(line))
    .filter((line, index, lines) => line.length > 0 || (index === 0 && lines.length === 1))
    .join('\n')
    .trim();
};

const extractRowsFromTable = (table: HTMLTableElement): string[][] => {
  const rows = Array.from(table.querySelectorAll('tr')).map(row =>
    Array.from(row.querySelectorAll('th, td')).map(cell => extractReadableText(cell))
  );
  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows
    .map(row => row.length < maxColumns ? [...row, ...Array(maxColumns - row.length).fill('')] : row)
    .filter(row => row.some(cell => normalizeText(cell).length > 0));
};

const buildWorksheetColumns = (rows: string[][]) => {
  const widths: number[] = [];
  rows.forEach(row => {
    row.forEach((cell, index) => {
      const longestLine = String(cell || '')
        .split('\n')
        .reduce((max, line) => Math.max(max, line.length), 0);
      widths[index] = Math.max(widths[index] || 10, Math.min(60, longestLine + 2));
    });
  });
  return widths.map(width => ({ wch: width }));
};

const isBlankRow = (row: string[]) => row.every(cell => normalizeText(cell).length === 0);

const compactSheetRows = (rows: string[][]) => {
  const compacted: string[][] = [];
  rows.forEach(row => {
    if (isBlankRow(row)) {
      if (compacted.length === 0 || isBlankRow(compacted[compacted.length - 1])) return;
      compacted.push(['']);
      return;
    }
    compacted.push(row);
  });

  while (compacted.length > 0 && isBlankRow(compacted[0])) {
    compacted.shift();
  }
  while (compacted.length > 0 && isBlankRow(compacted[compacted.length - 1])) {
    compacted.pop();
  }
  return compacted;
};

const extractOrderedRowsFromNode = (node: Node | null | undefined): string[][] => {
  if (!node) return [];

  if (node instanceof HTMLTableElement) {
    return extractRowsFromTable(node);
  }

  if (!(node instanceof HTMLElement)) {
    const text = normalizeText(node.textContent || '');
    return text ? [[text]] : [];
  }

  if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') {
    return [];
  }

  if (!node.querySelector('table')) {
    const text = extractReadableText(node);
    return text
      ? text.split('\n').map(line => [line])
      : [];
  }

  const rows: string[][] = [];
  node.childNodes.forEach(child => {
    const childRows = extractOrderedRowsFromNode(child);
    if (childRows.length === 0) return;
    if (rows.length > 0 && !isBlankRow(rows[rows.length - 1])) {
      rows.push(['']);
    }
    rows.push(...childRows);
  });
  return compactSheetRows(rows);
};

export const exportElementAsCsv = (element: HTMLElement | null, fileName: string) => {
  if (!element) return false;
  const clone = stripInteractiveElements(element);
  const rows = compactSheetRows(extractOrderedRowsFromNode(clone));

  if (rows.length === 0) return false;

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = buildWorksheetColumns(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  workbook.Workbook = { Views: [{ RTL: element.dir === 'rtl' || element.closest('[dir="rtl"]') !== null }] };
  downloadWorkbookFile(workbook, { fileName });
  return true;
};

export const extractElementReadableText = (element: HTMLElement | null) => {
  if (!element) return '';
  const clone = stripInteractiveElements(element);
  return extractReadableText(clone);
};

export const downloadElementAsHtml = (element: HTMLElement | null, options: HtmlSnapshotOptions) => {
  if (!element) return false;
  const clone = stripInteractiveElements(element);
  const dir = options.dir || 'rtl';
  const lang = options.lang || (dir === 'rtl' ? 'ar' : 'en');
  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${options.title}</title>
    <style>
      body {
        font-family: ${dir === 'rtl' ? "'Tajawal', Arial, sans-serif" : "'Segoe UI', Arial, sans-serif"};
        margin: 0;
        padding: 24px;
        background: #f8fafc;
        color: #0f172a;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border: 1px solid #e2e8f0;
        padding: 8px;
        text-align: ${dir === 'rtl' ? 'right' : 'left'};
      }
      .dir-ltr { direction: ltr; }
    </style>
  </head>
  <body>${clone.innerHTML}</body>
</html>`;

  downloadTextFile(html, options.fileName.endsWith('.html') ? options.fileName : `${options.fileName}.html`, 'text/html;charset=utf-8');
  return true;
};

export const printElementContent = (element: HTMLElement | null, options: PrintElementOptions) => {
  if (!element || typeof window === 'undefined') return false;

  // If a targetWindow was pre-opened, close it to avoid blank tabs/pages
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
  const hasStatementPrintFooter = Boolean(clone.querySelector('.statement-classic-sheet'));
  const stylesMarkup = collectPrintStylesMarkup();

  // Create a hidden iframe for print-in-place
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.outline = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-1';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;
  if (!printWindow) {
    document.body.removeChild(iframe);
    return false;
  }

  const printLocale = getStatementPrintLocale(lang);
  const printFooterPageLabel = lang.toLowerCase().startsWith('ar') ? 'الصفحة' : 'Page';
  const printFooterOfLabel = lang.toLowerCase().startsWith('ar') ? 'من' : 'of';
  const printFooterDateLabel = lang.toLowerCase().startsWith('ar') ? 'تاريخ الطباعة' : 'Print Date';
  const pageTopMarginMm = 10;
  const pageBottomMarginMm = hasStatementPrintFooter ? 18 : 10;
  const statementPrintFooterHtml = hasStatementPrintFooter
    ? `
    <div class="statement-print-footer" aria-hidden="true">
      <div class="statement-print-footer__meta">
        <span class="statement-print-footer__item">
          <span class="statement-print-footer__label">${printFooterDateLabel}</span>
          <span class="statement-print-footer__value" data-statement-print-date></span>
        </span>
        <span class="statement-print-footer__item">
          <span class="statement-print-footer__label">${printFooterPageLabel}</span>
          <span class="statement-print-footer__counter">
            <span class="statement-print-footer__value statement-print-footer__page-current"></span>
            <span class="statement-print-footer__label">${printFooterOfLabel}</span>
            <span class="statement-print-footer__value" data-statement-page-count>1</span>
          </span>
        </span>
      </div>
    </div>`
    : '';

  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${options.title}</title>
    ${stylesMarkup}
    <style>
      body {
        font-family: ${dir === 'rtl' ? "'Tajawal', Arial, sans-serif" : "'Segoe UI', Arial, sans-serif"};
        margin: 0;
        padding: 24px;
        background: #ffffff;
        color: #0f172a;
      }
      @media print {
        .no-print {
          display: none !important;
        }
      }
      [data-document-actions], button {
        display: none !important;
      }
      .report-header {
        position: static !important;
        top: auto !important;
        backdrop-filter: none !important;
      }
      .financial-reports-page {
        max-width: none !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .financial-reports-page.statement-report-active .overflow-x-auto:has(table) {
        overflow: visible !important;
      }
      .financial-reports-page.statement-report-active table {
        width: 100% !important;
        min-width: 0 !important;
        table-layout: auto !important;
      }
      .financial-reports-page.statement-report-active table th,
      .financial-reports-page.statement-report-active table td {
        padding: 7px 8px !important;
        font-size: 11px !important;
        line-height: 1.45 !important;
        vertical-align: top !important;
        white-space: normal !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
      }
      .financial-reports-page.statement-report-active .statement-report-table {
        width: 100% !important;
        min-width: 0 !important;
        table-layout: fixed !important;
      }
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(1),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(1) {
        width: 12% !important;
      }
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(2),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(2) {
        width: 48% !important;
      }
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(3),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(3),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(4),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(4),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) th:nth-child(5),
      .financial-reports-page.statement-report-active .statement-report-table:not(.statement-report-table--ledger) td:nth-child(5) {
        width: 13.33% !important;
      }
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(1),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(1) {
        width: 11% !important;
      }
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(2),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(2) {
        width: 53% !important;
      }
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(3),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(3),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(4),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(4),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger th:nth-child(5),
      .financial-reports-page.statement-report-active .statement-report-table.statement-report-table--ledger td:nth-child(5) {
        width: 12% !important;
      }
      .financial-reports-page.statement-report-active .statement-report-description,
      .financial-reports-page.statement-report-active .statement-operation-details,
      .financial-reports-page.statement-report-active .statement-detail-card,
      .financial-reports-page.statement-report-active .statement-detail-note,
      .financial-reports-page.statement-report-active .statement-line-items {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }
      .statement-ledger-date,
      .statement-ledger-amount {
        white-space: nowrap !important;
        font-variant-numeric: tabular-nums;
      }
      .statement-detail-grid {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 6px 10px !important;
      }
      .statement-operation-badges {
        gap: 4px !important;
      }
      .statement-line-items {
        gap: 6px !important;
      }
      .statement-line-item-meta {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, max-content)) !important;
        gap: 4px 10px !important;
        align-items: center !important;
        justify-content: start !important;
        line-height: 1.45 !important;
      }
      .statement-line-item-meta > * {
        min-width: 0 !important;
      }
      .statement-line-items .rounded-lg {
        break-inside: avoid !important;
      }
      .report-print-document {
        width: 100%;
        max-width: 1120px;
        margin: 0 auto;
      }
      .report-print-landscape {
        max-width: none !important;
      }
      .report-print-header {
        margin-bottom: 18px;
        padding-bottom: 14px;
        border-bottom: 2px solid #e2e8f0;
      }
      .report-print-header h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.35;
        font-weight: 900;
        color: #0f172a;
      }
      .report-print-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .report-print-chip {
        display: inline-flex;
        align-items: center;
        border: 1px solid #e2e8f0;
        border-radius: 999px;
        padding: 6px 10px;
        background: #f8fafc;
        color: #334155;
        font-size: 11px;
        font-weight: 700;
      }
      .report-print-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .report-print-content .report-print-section {
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
      }
      .report-print-content .report-print-table-section,
      .report-print-content .report-print-table-section .bg-white,
      .report-print-content .report-print-table-section .report-print-highlight {
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      .report-print-content .overflow-auto,
      .report-print-content .overflow-x-auto,
      .report-print-content .overflow-y-auto,
      .report-print-content .no-scrollbar {
        overflow: visible !important;
        max-width: none !important;
        max-height: none !important;
      }
      .report-print-content table {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        table-layout: auto !important;
        border-collapse: collapse !important;
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      .report-print-content .report-print-table--wide {
        table-layout: fixed !important;
      }
      .report-print-content .report-print-table--dense th,
      .report-print-content .report-print-table--dense td {
        padding: 6px 7px !important;
        font-size: 10px !important;
      }
      .report-print-content thead {
        display: table-header-group !important;
      }
      .report-print-content tfoot {
        display: table-footer-group !important;
      }
      .report-print-content tbody {
        display: table-row-group !important;
      }
      .report-print-content th,
      .report-print-content td {
        border: 1px solid #e5e7eb !important;
        padding: 8px 10px !important;
        text-align: ${dir === 'rtl' ? 'right' : 'left'} !important;
        font-size: 12px !important;
        line-height: 1.45 !important;
        white-space: normal !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        vertical-align: top !important;
      }
      .report-print-content thead th {
        background: #f8fafc !important;
        color: #334155 !important;
      }
      .report-print-content [class*="shadow"] {
        box-shadow: none !important;
      }
      .report-print-content [class*="rounded"] {
        border-radius: 14px !important;
      }
      .report-print-content .bg-white {
        background: #ffffff !important;
      }
      .report-print-content .report-print-highlight,
      .report-print-content [class*="bg-gradient"] {
        background: #f8fafc !important;
        color: #0f172a !important;
        border: 1px solid #e2e8f0 !important;
      }
      .report-print-content .report-print-highlight *,
      .report-print-content [class*="bg-gradient"] * {
        color: inherit !important;
      }
      .report-print-content .absolute {
        display: none !important;
      }
      .report-print-content .sticky,
      .report-print-content .fixed {
        position: static !important;
        inset: auto !important;
      }
      .report-print-content .grid {
        gap: 12px !important;
      }
      .report-print-content .grid[class*="grid-cols-2"],
      .report-print-content .grid[class*="grid-cols-3"],
      .report-print-content .grid[class*="grid-cols-4"],
      .report-print-content .grid[class*="grid-cols-5"] {
        grid-template-columns: minmax(0, 1fr) !important;
      }
      .report-print-content .flex {
        flex-wrap: wrap !important;
      }
      .report-print-content > *:not(.report-print-table-section),
      .report-print-content .bg-white:not(.report-print-table-section),
      .report-print-content .report-print-highlight:not(.report-print-table-section) {
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
      }
      .report-print-content .report-print-table-section,
      .report-print-content .report-print-table-section *,
      .report-print-content .report-print-table-section .bg-white {
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      .report-print-content .report-print-table tr,
      .report-print-content .report-print-table td,
      .report-print-content .report-print-table th {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      .report-print-income .grid[class*="grid-cols-2"] {
        grid-template-columns: minmax(0, 1fr) !important;
      }
      .report-print-statement .statement-report-table {
        table-layout: fixed !important;
      }
      .report-print-statement .statement-report-table th,
      .report-print-statement .statement-report-table td {
        font-size: 13px !important;
        line-height: 1.65 !important;
        padding: 10px 9px !important;
      }
      .report-print-statement .statement-report-description {
        font-size: 13px !important;
        line-height: 1.75 !important;
        font-weight: 700 !important;
      }
      .report-print-statement .statement-inline-detail {
        margin-top: 8px !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      .report-print-statement .statement-inline-table,
      .report-print-statement .statement-classic-inline-table {
        width: 100% !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
      }
      .report-print-statement .statement-inline-table th,
      .report-print-statement .statement-inline-table td,
      .report-print-statement .statement-classic-inline-table th,
      .report-print-statement .statement-classic-inline-table td {
        padding: 6px 7px !important;
        font-size: 10px !important;
        line-height: 1.4 !important;
        letter-spacing: normal !important;
      }
      .report-print-statement .statement-inline-value,
      .report-print-statement .statement-classic-inline-value {
        white-space: nowrap !important;
        font-variant-numeric: tabular-nums !important;
        letter-spacing: normal !important;
      }
      .report-print-statement .statement-report-table.statement-report-table--with-voucher th:nth-child(2),
      .report-print-statement .statement-report-table.statement-report-table--with-voucher td:nth-child(2) {
        white-space: nowrap !important;
        font-variant-numeric: tabular-nums !important;
      }
      .report-print-statement .statement-detail-note,
      .report-print-statement .statement-operation-badges {
        display: none !important;
      }
      .report-print-statement .statement-report-table:not(.statement-report-table--ledger) th:nth-child(1),
      .report-print-statement .statement-report-table:not(.statement-report-table--ledger) td:nth-child(1) {
        width: 13% !important;
      }
      .report-print-statement .statement-report-table:not(.statement-report-table--ledger) th:nth-child(2),
      .report-print-statement .statement-report-table:not(.statement-report-table--ledger) td:nth-child(2) {
        width: 48% !important;
      }
      .report-print-statement .statement-report-table:not(.statement-report-table--ledger) th:nth-child(3),
      .report-print-statement .statement-report-table:not(.statement-report-table--ledger) td:nth-child(3),
      .report-print-statement .statement-report-table:not(.statement-report-table--ledger) th:nth-child(4),
      .report-print-statement .statement-report-table:not(.statement-report-table--ledger) td:nth-child(4),
      .report-print-statement .statement-report-table:not(.statement-report-table--ledger) th:nth-child(5),
      .report-print-statement .statement-report-table:not(.statement-report-table--ledger) td:nth-child(5) {
        width: 13% !important;
      }
      .report-print-account-ledger .statement-report-table--ledger th:nth-child(1),
      .report-print-account-ledger .statement-report-table--ledger td:nth-child(1),
      .report-print-customer-statement .statement-report-table--ledger th:nth-child(1),
      .report-print-customer-statement .statement-report-table--ledger td:nth-child(1),
      .report-print-supplier-statement .statement-report-table--ledger th:nth-child(1),
      .report-print-supplier-statement .statement-report-table--ledger td:nth-child(1) {
        width: 11% !important;
      }
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(1),
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(1),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(1),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(1),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(1),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(1) {
        width: 14% !important;
      }
      .report-print-account-ledger .statement-report-table--ledger th:nth-child(2),
      .report-print-account-ledger .statement-report-table--ledger td:nth-child(2),
      .report-print-customer-statement .statement-report-table--ledger th:nth-child(2),
      .report-print-customer-statement .statement-report-table--ledger td:nth-child(2),
      .report-print-supplier-statement .statement-report-table--ledger th:nth-child(2),
      .report-print-supplier-statement .statement-report-table--ledger td:nth-child(2) {
        width: 53% !important;
      }
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(2),
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(2),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(2),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(2),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(2),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(2) {
        width: 13% !important;
      }
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(3),
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(3),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(3),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(3),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(3),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(3) {
        width: 31% !important;
      }
      .report-print-account-ledger .statement-report-table--ledger th:nth-child(3),
      .report-print-account-ledger .statement-report-table--ledger td:nth-child(3),
      .report-print-account-ledger .statement-report-table--ledger th:nth-child(4),
      .report-print-account-ledger .statement-report-table--ledger td:nth-child(4),
      .report-print-account-ledger .statement-report-table--ledger th:nth-child(5),
      .report-print-account-ledger .statement-report-table--ledger td:nth-child(5),
      .report-print-customer-statement .statement-report-table--ledger th:nth-child(3),
      .report-print-customer-statement .statement-report-table--ledger td:nth-child(3),
      .report-print-customer-statement .statement-report-table--ledger th:nth-child(4),
      .report-print-customer-statement .statement-report-table--ledger td:nth-child(4),
      .report-print-customer-statement .statement-report-table--ledger th:nth-child(5),
      .report-print-customer-statement .statement-report-table--ledger td:nth-child(5),
      .report-print-supplier-statement .statement-report-table--ledger th:nth-child(3),
      .report-print-supplier-statement .statement-report-table--ledger td:nth-child(3),
      .report-print-supplier-statement .statement-report-table--ledger th:nth-child(4),
      .report-print-supplier-statement .statement-report-table--ledger td:nth-child(4),
      .report-print-supplier-statement .statement-report-table--ledger th:nth-child(5),
      .report-print-supplier-statement .statement-report-table--ledger td:nth-child(5) {
        width: 12% !important;
      }
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(4),
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(4),
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(5),
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(5),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(4),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(4),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(5),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(5),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(4),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(4),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(5),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(5) {
        width: 12% !important;
      }
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(6),
      .report-print-account-ledger .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(6),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(6),
      .report-print-customer-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(6),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher th:nth-child(6),
      .report-print-supplier-statement .statement-report-table--ledger.statement-report-table--with-voucher td:nth-child(6) {
        width: 18% !important;
      }
      .report-print-purchases-list .report-table-purchases-list th:nth-child(1),
      .report-print-purchases-list .report-table-purchases-list td:nth-child(1) {
        width: 16% !important;
      }
      .report-print-purchases-list .report-table-purchases-list th:nth-child(2),
      .report-print-purchases-list .report-table-purchases-list td:nth-child(2) {
        width: 42% !important;
      }
      .report-print-purchases-list .report-table-purchases-list th:nth-child(3),
      .report-print-purchases-list .report-table-purchases-list td:nth-child(3) {
        width: 16% !important;
      }
      .report-print-purchases-list .report-table-purchases-list th:nth-child(4),
      .report-print-purchases-list .report-table-purchases-list td:nth-child(4) {
        width: 26% !important;
      }
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item,
      .report-print-purchase-price-variance .report-table-purchase-price-variance,
      .report-print-supplier-analysis .report-table-supplier-analysis,
      .report-print-import-expenses-detail .report-table-import-expense-invoices {
        table-layout: fixed !important;
      }
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item th:nth-child(1),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item td:nth-child(1) {
        width: 20% !important;
      }
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item th:nth-child(2),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item td:nth-child(2),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item th:nth-child(3),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item td:nth-child(3),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item th:nth-child(4),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item td:nth-child(4) {
        width: 7.5% !important;
      }
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item th:nth-child(5),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item td:nth-child(5),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item th:nth-child(6),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item td:nth-child(6),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item th:nth-child(7),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item td:nth-child(7),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item th:nth-child(8),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item td:nth-child(8),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item th:nth-child(9),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item td:nth-child(9) {
        width: 9% !important;
      }
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item th:nth-child(10),
      .report-print-purchase-cost-by-item .report-table-purchase-cost-by-item td:nth-child(10) {
        width: 12.5% !important;
      }
      .report-print-purchase-price-variance .report-table-purchase-price-variance th:nth-child(1),
      .report-print-purchase-price-variance .report-table-purchase-price-variance td:nth-child(1) {
        width: 14% !important;
      }
      .report-print-purchase-price-variance .report-table-purchase-price-variance th:nth-child(2),
      .report-print-purchase-price-variance .report-table-purchase-price-variance td:nth-child(2) {
        width: 18% !important;
      }
      .report-print-purchase-price-variance .report-table-purchase-price-variance th:nth-child(3),
      .report-print-purchase-price-variance .report-table-purchase-price-variance td:nth-child(3) {
        width: 14% !important;
      }
      .report-print-purchase-price-variance .report-table-purchase-price-variance th:nth-child(4),
      .report-print-purchase-price-variance .report-table-purchase-price-variance td:nth-child(4),
      .report-print-purchase-price-variance .report-table-purchase-price-variance th:nth-child(5),
      .report-print-purchase-price-variance .report-table-purchase-price-variance td:nth-child(5),
      .report-print-purchase-price-variance .report-table-purchase-price-variance th:nth-child(6),
      .report-print-purchase-price-variance .report-table-purchase-price-variance td:nth-child(6),
      .report-print-purchase-price-variance .report-table-purchase-price-variance th:nth-child(7),
      .report-print-purchase-price-variance .report-table-purchase-price-variance td:nth-child(7),
      .report-print-purchase-price-variance .report-table-purchase-price-variance th:nth-child(8),
      .report-print-purchase-price-variance .report-table-purchase-price-variance td:nth-child(8),
      .report-print-purchase-price-variance .report-table-purchase-price-variance th:nth-child(9),
      .report-print-purchase-price-variance .report-table-purchase-price-variance td:nth-child(9) {
        width: 9% !important;
      }
      .report-print-supplier-analysis .report-table-supplier-analysis th:nth-child(1),
      .report-print-supplier-analysis .report-table-supplier-analysis td:nth-child(1) {
        width: 18% !important;
      }
      .report-print-supplier-analysis .report-table-supplier-analysis th:nth-child(2),
      .report-print-supplier-analysis .report-table-supplier-analysis td:nth-child(2),
      .report-print-supplier-analysis .report-table-supplier-analysis th:nth-child(3),
      .report-print-supplier-analysis .report-table-supplier-analysis td:nth-child(3),
      .report-print-supplier-analysis .report-table-supplier-analysis th:nth-child(4),
      .report-print-supplier-analysis .report-table-supplier-analysis td:nth-child(4),
      .report-print-supplier-analysis .report-table-supplier-analysis th:nth-child(5),
      .report-print-supplier-analysis .report-table-supplier-analysis td:nth-child(5),
      .report-print-supplier-analysis .report-table-supplier-analysis th:nth-child(6),
      .report-print-supplier-analysis .report-table-supplier-analysis td:nth-child(6),
      .report-print-supplier-analysis .report-table-supplier-analysis th:nth-child(7),
      .report-print-supplier-analysis .report-table-supplier-analysis td:nth-child(7),
      .report-print-supplier-analysis .report-table-supplier-analysis th:nth-child(8),
      .report-print-supplier-analysis .report-table-supplier-analysis td:nth-child(8),
      .report-print-supplier-analysis .report-table-supplier-analysis th:nth-child(9),
      .report-print-supplier-analysis .report-table-supplier-analysis td:nth-child(9) {
        width: 10.25% !important;
      }
      .report-print-import-expenses-detail .report-table-import-expense-invoices th:nth-child(1),
      .report-print-import-expenses-detail .report-table-import-expense-invoices td:nth-child(1) {
        width: 12% !important;
      }
      .report-print-import-expenses-detail .report-table-import-expense-invoices th:nth-child(2),
      .report-print-import-expenses-detail .report-table-import-expense-invoices td:nth-child(2) {
        width: 9% !important;
      }
      .report-print-import-expenses-detail .report-table-import-expense-invoices th:nth-child(3),
      .report-print-import-expenses-detail .report-table-import-expense-invoices td:nth-child(3) {
        width: 14% !important;
      }
      .report-print-import-expenses-detail .report-table-import-expense-invoices th:nth-child(4),
      .report-print-import-expenses-detail .report-table-import-expense-invoices td:nth-child(4),
      .report-print-import-expenses-detail .report-table-import-expense-invoices th:nth-child(5),
      .report-print-import-expenses-detail .report-table-import-expense-invoices td:nth-child(5) {
        width: 9% !important;
      }
      .report-print-import-expenses-detail .report-table-import-expense-invoices th:nth-child(6),
      .report-print-import-expenses-detail .report-table-import-expense-invoices td:nth-child(6),
      .report-print-import-expenses-detail .report-table-import-expense-invoices th:nth-child(7),
      .report-print-import-expenses-detail .report-table-import-expense-invoices td:nth-child(7) {
        width: 14% !important;
      }
      .report-print-import-expenses-detail .report-table-import-expense-invoices th:nth-child(8),
      .report-print-import-expenses-detail .report-table-import-expense-invoices td:nth-child(8) {
        width: 8% !important;
      }
      .report-print-import-expenses-detail .report-table-import-expense-invoices th:nth-child(9),
      .report-print-import-expenses-detail .report-table-import-expense-invoices td:nth-child(9) {
        width: 11% !important;
      }
      .dir-ltr { direction: ltr; }
      .statement-print-footer {
        display: none;
      }
      .statement-print-footer__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
      }
      .statement-print-footer__item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: #334155;
        white-space: nowrap;
      }
      .statement-print-footer__label {
        color: #64748b;
        font-weight: 800;
      }
      .statement-print-footer__value {
        color: #111827;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
      }
      .statement-print-footer__counter {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-variant-numeric: tabular-nums;
      }
      .statement-print-footer__page-current::before {
        content: counter(page);
      }
      @media print {
        @page {
          size: ${pageOrientation} A4;
          margin: ${pageTopMarginMm}mm 14mm ${pageBottomMarginMm}mm;
        }
        body {
          padding: 0;
          margin: 0;
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .report-print-content .report-print-table-section {
          break-inside: auto !important;
          page-break-inside: auto !important;
        }
        table {
          page-break-inside: auto;
        }
        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        thead {
          display: table-header-group;
        }
        tfoot {
          display: table-footer-group;
        }
        .statement-print-footer {
          position: fixed;
          left: 14mm;
          right: 14mm;
          bottom: 4mm;
          z-index: 50;
          display: flex !important;
          align-items: center;
          justify-content: space-between;
          padding-top: 3mm;
          border-top: 1px solid #cbd5e1;
          background: #ffffff;
        }
      }
    </style>
  </head>
  <body>
    <div data-report-print-root>
      ${clone.outerHTML}
    </div>
    ${statementPrintFooterHtml}
    <script>
      const syncStatementFooterMeta = () => {
        const printDate = new Intl.DateTimeFormat('${printLocale}', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(new Date());
        document.querySelectorAll('[data-statement-print-date]').forEach(node => {
          node.textContent = printDate;
        });

        const mmToPx = ${MM_TO_PX};
        const pageHeightMm = '${pageOrientation}' === 'landscape' ? 210 : 297;
        const topMarginPx = ${pageTopMarginMm} * mmToPx;
        const bottomMarginPx = ${pageBottomMarginMm} * mmToPx;
        const bodyStyle = window.getComputedStyle(document.body);
        const bodyPaddingTop = parseFloat(bodyStyle.paddingTop) || 0;
        const bodyPaddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;
        const printableHeight = Math.max(1, (pageHeightMm * mmToPx) - topMarginPx - bottomMarginPx - bodyPaddingTop - bodyPaddingBottom);
        const root = document.querySelector('[data-report-print-root]');
        const contentHeight = Math.max(
          root ? Math.max(root.scrollHeight, root.getBoundingClientRect().height) : 0
        );
        const pageCount = Math.max(1, Math.ceil(contentHeight / printableHeight));
        document.querySelectorAll('[data-statement-page-count]').forEach(node => {
          node.textContent = String(pageCount);
        });
      };

      const doPrint = () => {
        window.focus();
        setTimeout(() => {
          window.print();
        }, 120);
      };

      window.onload = async () => {
        try {
          if (document.fonts?.ready) {
            await Promise.race([
              document.fonts.ready,
              new Promise(resolve => setTimeout(resolve, 800))
            ]);
          }
        } catch {}
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        syncStatementFooterMeta();
        doPrint();
      };
    </script>
  </body>
</html>`;

  try {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    };

    printWindow.addEventListener('afterprint', cleanup);

    // Safety fallback: remove after 20 seconds
    setTimeout(() => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    }, 20000);

    return true;
  } catch {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
    return false;
  }
};

export const printHtmlContent = (html: string, options?: { targetWindow?: Window | null }) => {
  if (typeof window === 'undefined') return false;

  // Close targetWindow if it was passed to avoid blank tabs
  if (options?.targetWindow && !options.targetWindow.closed) {
    try {
      options.targetWindow.close();
    } catch {}
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.outline = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-1';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;
  if (!printWindow) {
    document.body.removeChild(iframe);
    return false;
  }

  try {
    let finalHtml = html;
    if (!html.includes('window.print()')) {
      const printScript = `
        <script>
          window.onload = () => {
            window.focus();
            setTimeout(() => {
              window.print();
            }, 150);
          };
        </script>
      `;
      if (html.includes('</body>')) {
        finalHtml = html.replace('</body>', `${printScript}</body>`);
      } else {
        finalHtml = html + printScript;
      }
    }

    printWindow.document.open();
    printWindow.document.write(finalHtml);
    printWindow.document.close();

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    };

    printWindow.addEventListener('afterprint', cleanup);

    // Safety fallback: remove after 20 seconds
    setTimeout(() => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    }, 20000);

    return true;
  } catch {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
    return false;
  }
};

const expandSnapshotLayout = (root: HTMLElement) => {
  root.style.overflow = 'visible';
  root.style.height = 'auto';
  root.style.maxHeight = 'none';
  root.style.maxWidth = 'none';

  root.querySelectorAll<HTMLElement>('.overflow-auto, .overflow-x-auto, .overflow-y-auto, .overflow-hidden, .no-scrollbar').forEach(node => {
    node.style.overflow = 'visible';
    node.style.height = 'auto';
    node.style.maxHeight = 'none';
    node.style.maxWidth = 'none';
  });

  root.querySelectorAll<HTMLElement>('.sticky, .fixed').forEach(node => {
    node.style.position = 'static';
    node.style.inset = 'auto';
  });

  root.querySelectorAll<HTMLElement>('.h-full, .max-h-full, .min-h-full, .flex-1').forEach(node => {
    node.style.height = 'auto';
    node.style.maxHeight = 'none';
    node.style.minHeight = '0';
  });

  root.querySelectorAll<HTMLElement>('.statement-mobile-viewport, .statement-mobile-canvas, .directory-statement-content').forEach(node => {
    node.style.overflow = 'visible';
    node.style.width = '100%';
    node.style.minWidth = '0';
    node.style.maxWidth = 'none';
    node.style.height = 'auto';
    node.style.maxHeight = 'none';
    node.style.transform = 'none';
    node.style.setProperty('zoom', '1');
  });

  root.querySelectorAll<HTMLElement>('.directory-statement-inline-detail, .statement-inline-detail').forEach(node => {
    node.style.width = '100%';
    node.style.minWidth = '0';
    node.style.maxWidth = 'none';
  });

  root.querySelectorAll<HTMLElement>('table').forEach(node => {
    node.style.width = '100%';
    node.style.minWidth = '0';
    node.style.maxWidth = '100%';
  });

  const isRtl = root.dir === 'rtl' || root.getAttribute('dir') === 'rtl' || root.closest('[dir="rtl"]') !== null || document.documentElement.dir === 'rtl';
  if (isRtl) {
    root.style.setProperty('letter-spacing', 'normal', 'important');
    root.querySelectorAll('*').forEach(node => {
      if (node instanceof HTMLElement) {
        node.style.setProperty('letter-spacing', 'normal', 'important');
      }
    });
  }
};

const prepareSnapshotHost = (element: HTMLElement, options: PdfSnapshotOptions) => {
  const dir = options.dir || 'rtl';
  const lang = options.lang || (dir === 'rtl' ? 'ar' : 'en');
  const padding = options.padding ?? 20;
  const backgroundColor = options.backgroundColor || '#ffffff';
  const clone = stripInteractiveElements(element);
  const hasClassicStatementLayout = clone.classList.contains('statement-classic-sheet')
    || Boolean(clone.querySelector('.statement-classic-sheet'));
  const liveElementWidth = Math.max(Math.ceil(element.getBoundingClientRect().width), 360);
  const orientation = options.orientation || 'portrait';

  // A4 dimensions in pixels at 96 DPI: portrait = 794 x 1123, landscape = 1123 x 794
  // Use these as standard widths for proper A4 rendering
  const a4PortraitWidth = 794;
  const a4LandscapeWidth = 1123;
  const classicRenderWidth = orientation === 'landscape' ? a4LandscapeWidth : a4PortraitWidth;

  const minRenderWidth = Math.max(
    360,
    options.minRenderWidth ?? (hasClassicStatementLayout ? classicRenderWidth : (orientation === 'landscape' ? a4LandscapeWidth : a4PortraitWidth))
  );
  const defaultMaxRenderWidth = hasClassicStatementLayout
    ? classicRenderWidth
    : (orientation === 'landscape' ? a4LandscapeWidth : a4PortraitWidth);
  const maxRenderWidth = Math.max(minRenderWidth, options.maxRenderWidth ?? defaultMaxRenderWidth);
  const measuredWidth = Math.max(element.scrollWidth, Math.ceil(element.getBoundingClientRect().width), minRenderWidth);
  const sourceWidth = Math.min(measuredWidth, maxRenderWidth);
  const host = document.createElement('div');
  host.classList.add('pdf-export-host');
  const viewport = document.createElement('div');

  host.lang = lang;
  host.dir = 'ltr'; // Set outer containers to LTR to avoid html2canvas RTL layout/positioning bugs
  viewport.dir = 'ltr';
  clone.dir = dir;  // Keep the cloned statement content itself RTL (or LTR if English)
  host.style.position = 'absolute';
  host.style.left = '0';
  host.style.top = '0';
  host.style.zIndex = '-9999';
  host.style.opacity = '0.02'; // Force mobile browser layout engine to render fully without offscreen pruning
  host.style.pointerEvents = 'none';
  host.style.background = backgroundColor;
  // Add extra bottom padding to ensure footer/summary rows are fully captured
  host.style.padding = `${padding}px ${padding}px ${padding + 40}px ${padding}px`;
  host.style.width = `${sourceWidth + (padding * 2)}px`;
  host.style.boxSizing = 'border-box';
  host.style.overflow = 'hidden';

  viewport.style.width = `${sourceWidth}px`;
  viewport.style.boxSizing = 'border-box';
  viewport.style.position = 'relative';
  viewport.style.overflow = 'hidden';

  clone.style.width = `${sourceWidth}px`;
  clone.style.boxSizing = 'border-box';
  clone.style.transformOrigin = 'top left';
  expandSnapshotLayout(clone);

  viewport.appendChild(clone);
  host.appendChild(viewport);

  // Inject all document stylesheets + font declarations so html2canvas
  // renders with the same fonts and layout rules as the live page.
  const styleHost = document.createElement('div');
  styleHost.style.display = 'none';
  Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]')).forEach(node => {
    styleHost.appendChild(node.cloneNode(true));
  });
  const fontFace = document.createElement('style');
  const classicOverrides = hasClassicStatementLayout
    ? `
    /* Classic Statement print-equivalence overrides for PDF export */
    body .pdf-export-host th,
    body .pdf-export-host td {
      box-sizing: border-box !important;
    }
    body .pdf-export-host .statement-classic-sheet {
      border-radius: 0 !important;
      border: 1px solid #111827 !important;
      box-shadow: none !important;
      background: #ffffff !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    body .pdf-export-host .statement-classic-header {
      padding: 18px 20px 14px !important;
    }
    body .pdf-export-host .statement-classic-title {
      font-size: 22px !important;
    }
    body .pdf-export-host .statement-classic-table--paper {
      min-width: 100% !important;
    }
    body .pdf-export-host .statement-classic-check-image {
      width: 96px !important;
      height: 60px !important;
    }
    body .pdf-export-host .statement-classic-table th,
    body .pdf-export-host .statement-classic-table td,
    body .pdf-export-host .statement-classic-inline-table th,
    body .pdf-export-host .statement-classic-inline-table td {
      color: #111827 !important;
    }
    body .pdf-export-host .statement-classic-table th,
    body .pdf-export-host .statement-classic-table td,
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper th,
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper td,
    body .pdf-export-host .statement-report-table.statement-classic-table--paper th,
    body .pdf-export-host .statement-report-table.statement-classic-table--paper td {
      font-size: 11px !important;
      padding: 8px 5px !important;
    }
    body .pdf-export-host .statement-classic-inline-table th,
    body .pdf-export-host .statement-classic-inline-table td {
      font-size: 9.5px !important;
      padding: 5px 6px !important;
    }
    body .pdf-export-host .statement-classic-company-name {
      font-size: 14px !important;
    }
    body .pdf-export-host .statement-classic-fill-row td {
      height: 40px !important;
    }
    body .pdf-export-host .statement-classic-footer {
      display: none !important;
    }

    /* Reset column widths of the main table in PDF to desktop standard */
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper th:nth-child(1),
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper td:nth-child(1),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper th:nth-child(1),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper td:nth-child(1) {
      width: 12% !important;
    }
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper th:nth-child(2),
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper td:nth-child(2),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper th:nth-child(2),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper td:nth-child(2) {
      width: 12% !important;
    }
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper th:nth-child(3),
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper td:nth-child(3),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper th:nth-child(3),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper td:nth-child(3) {
      width: 39% !important;
    }
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper th:nth-child(4),
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper td:nth-child(4),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper th:nth-child(4),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper td:nth-child(4) {
      width: 11% !important;
    }
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper th:nth-child(5),
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper td:nth-child(5),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper th:nth-child(5),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper td:nth-child(5) {
      width: 11% !important;
    }
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper th:nth-child(6),
    body .pdf-export-host .directory-statement-table.statement-classic-table--paper td:nth-child(6),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper th:nth-child(6),
    body .pdf-export-host .statement-report-table.statement-classic-table--paper td:nth-child(6) {
      width: 15% !important;
    }

    /* Reset column widths of the inline details tables in PDF to desktop standard */
    body .pdf-export-host .statement-classic-inline-table--voucher colgroup col:nth-child(1) {
      width: 24% !important;
    }
    body .pdf-export-host .statement-classic-inline-table--voucher colgroup col:nth-child(2) {
      width: 50% !important;
    }
    body .pdf-export-host .statement-classic-inline-table--voucher colgroup col:nth-child(3) {
      width: 26% !important;
    }
    body .pdf-export-host .statement-classic-inline-table:not(.statement-classic-inline-table--voucher) colgroup col:nth-child(1) {
      width: 39% !important;
    }
    body .pdf-export-host .statement-classic-inline-table:not(.statement-classic-inline-table--voucher) colgroup col:nth-child(2) {
      width: 17% !important;
    }
    body .pdf-export-host .statement-classic-inline-table:not(.statement-classic-inline-table--voucher) colgroup col:nth-child(3) {
      width: 18% !important;
    }
    body .pdf-export-host .statement-classic-inline-table:not(.statement-classic-inline-table--voucher) colgroup col:nth-child(4) {
      width: 26% !important;
    }

    /* Force details fonts and alignment */
    body .pdf-export-host .statement-classic-document-number,
    body .pdf-export-host .statement-classic-secondary,
    body .pdf-export-host .statement-classic-note-line {
      font-size: 9.5px !important;
      line-height: 1.35 !important;
    }
    body .pdf-export-host .statement-classic-voucher-check-meta {
      font-size: 9px !important;
      line-height: 1.3 !important;
    }
    body .pdf-export-host .statement-classic-identity--party,
    body .pdf-export-host .statement-classic-identity--phone {
      font-size: 12px !important;
    }
    body .pdf-export-host .statement-classic-meta-row {
      font-size: 11px !important;
    }
    `
    : '';

  const snapshotSupportStyles = `
    body .pdf-export-host {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body .pdf-export-host * {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body .pdf-export-host table {
      border-collapse: collapse;
      width: 100% !important;
      table-layout: fixed !important;
      page-break-inside: auto;
    }
    body .pdf-export-host tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    body .pdf-export-host thead {
      display: table-header-group;
    }
    body .pdf-export-host th, body .pdf-export-host td {
      border: 1px solid #e5e7eb;
      padding: 8px 10px;
      text-align: ${dir === 'rtl' ? 'right' : 'left'};
      vertical-align: top;
      font-size: 12px;
      line-height: 1.45;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
      page-break-inside: avoid;
    }
    body .pdf-export-host .statement-mobile-viewport,
    body .pdf-export-host .statement-mobile-canvas,
    body .pdf-export-host .directory-statement-content {
      overflow: visible !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      height: auto !important;
      max-height: none !important;
      transform: none !important;
      zoom: 1 !important;
    }
    body .pdf-export-host .directory-statement-table,
    body .pdf-export-host .statement-report-table {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      table-layout: fixed !important;
    }
    body .pdf-export-host .directory-statement-table th,
    body .pdf-export-host .directory-statement-table td,
    body .pdf-export-host .statement-report-table th,
    body .pdf-export-host .statement-report-table td {
      font-size: 12px !important;
      line-height: 1.6 !important;
      padding: 8px 7px !important;
      white-space: normal !important;
      word-break: break-word !important;
      overflow-wrap: anywhere !important;
    }
    body .pdf-export-host .directory-statement-description,
    body .pdf-export-host .directory-statement-description-text,
    body .pdf-export-host .statement-report-description {
      font-size: 12px !important;
      line-height: 1.72 !important;
      font-weight: 700 !important;
    }
    body .pdf-export-host .directory-statement-inline-detail,
    body .pdf-export-host .statement-inline-detail {
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
    }
    body .pdf-export-host .directory-statement-inline-title,
    body .pdf-export-host .statement-inline-detail-title,
    body .pdf-export-host .statement-inline-detail-footer {
      font-size: 10px !important;
      line-height: 1.35 !important;
    }
    body .pdf-export-host .directory-statement-detail-table th,
    body .pdf-export-host .directory-statement-detail-table td,
    body .pdf-export-host .statement-inline-table th,
    body .pdf-export-host .statement-inline-table td {
      font-size: 10px !important;
      line-height: 1.35 !important;
      padding: 6px 7px !important;
    }
    body .pdf-export-host .directory-statement-detail-table .statement-inline-value,
    body .pdf-export-host .statement-inline-value {
      white-space: nowrap !important;
      word-break: keep-all !important;
      overflow-wrap: normal !important;
      font-variant-numeric: tabular-nums !important;
      letter-spacing: normal !important;
    }
    body .pdf-export-host .statement-classic-summary-inline-row,
    body .pdf-export-host .statement-classic-fill-row {
      page-break-inside: avoid !important;
      page-break-before: avoid !important;
    }
    body .pdf-export-host .statement-classic-summary-inline-row td {
      background: #f3f4f6 !important;
      font-weight: 900 !important;
      color: #111827 !important;
    }
    body .pdf-export-host .statement-inline-table,
    body .pdf-export-host .statement-classic-inline-table,
    body .pdf-export-host .directory-statement-detail-table {
      width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
      letter-spacing: normal !important;
    }
    body .pdf-export-host .statement-inline-table th,
    body .pdf-export-host .statement-inline-table td,
    body .pdf-export-host .statement-classic-inline-table th,
    body .pdf-export-host .statement-classic-inline-table td,
    body .pdf-export-host .directory-statement-detail-table th,
    body .pdf-export-host .directory-statement-detail-table td {
      font-size: 10px !important;
      line-height: 1.4 !important;
      padding: 6px 7px !important;
      letter-spacing: normal !important;
    }
    body .pdf-export-host .statement-classic-inline-table thead th:nth-child(2),
    body .pdf-export-host .statement-classic-inline-table thead th:nth-child(3),
    body .pdf-export-host .statement-classic-inline-table thead th:nth-child(4),
    body .pdf-export-host .statement-classic-inline-table td:nth-child(2),
    body .pdf-export-host .statement-classic-inline-table td:nth-child(3),
    body .pdf-export-host .statement-classic-inline-table td:nth-child(4) {
      font-size: 10px !important;
      letter-spacing: normal !important;
      padding-inline: 0.16rem !important;
    }
    body .pdf-export-host .statement-classic-inline-table thead th:nth-child(1),
    body .pdf-export-host .statement-classic-inline-table td:nth-child(1) {
      font-size: 10px !important;
      line-height: 1.4 !important;
      padding-inline: 0.16rem !important;
      letter-spacing: normal !important;
    }
    body .pdf-export-host .statement-classic-inline-table--voucher thead th,
    body .pdf-export-host .statement-classic-inline-table--voucher td {
      font-size: 10px !important;
      line-height: 1.4 !important;
      letter-spacing: normal !important;
    }
    body .pdf-export-host .statement-classic-document-number,
    body .pdf-export-host .statement-classic-secondary,
    body .pdf-export-host .statement-classic-note-line,
    body .pdf-export-host .statement-classic-voucher-check-meta {
      font-size: 10px !important;
      line-height: 1.4 !important;
      letter-spacing: normal !important;
    }
    ${classicOverrides}
  `;
  fontFace.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=block');
    :root, body, [dir="rtl"], [dir="ltr"] {
      --font-app-ar: 'Tajawal', Arial, sans-serif !important;
      --font-app-en: 'Segoe UI', Arial, sans-serif !important;
      letter-spacing: normal !important;
    }
    * {
      font-family: ${dir === 'rtl' ? "'Tajawal', Arial, sans-serif" : "'Segoe UI', Arial, sans-serif"} !important;
      letter-spacing: normal !important;
    }
    .dir-ltr { direction: ltr; unicode-bidi: embed; }
    ${snapshotSupportStyles}
  `;
  styleHost.appendChild(fontFace);
  host.insertBefore(styleHost, viewport);

  document.body.appendChild(host);

  return { host, viewport, clone, backgroundColor, padding };
};

export const buildElementPdfFile = async (element: HTMLElement | null, options: PdfSnapshotOptions): Promise<File | null> => {
  if (!element || typeof window === 'undefined') return null;

  const { host, viewport, clone, backgroundColor, padding } = prepareSnapshotHost(element, options);

  try {
    // Force Arabic font (Tajawal) to be fully loaded before capturing.
    // document.fonts.ready alone is insufficient with display=swap.
    try {
      await Promise.all([
        document.fonts.load('400 16px Tajawal'),
        document.fonts.load('700 16px Tajawal'),
        document.fonts.load('900 16px Tajawal')
      ]);
    } catch { /* font API may not be available */ }
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    // Allow an extra frame for fonts to render in the offscreen host.
    await waitForRenderPass(2, 140);

    const pdf = new jsPDF({
      orientation: options.orientation || 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true
    });

    // A4 dimensions in points: portrait = 595.28 x 841.89, landscape = 841.89 x 595.28
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Use consistent margins for A4 pages (40pt = ~14mm, professional standard)
    const margin = 40;
    const printableWidth = pageWidth - (margin * 2);
    const printableHeight = pageHeight - (margin * 2);

    // Enhanced scale for better quality on A4
    const scale = options.canvasScale ?? 2.5;

    // Use the bounded layout width for capture. scrollWidth can balloon when a child overflows,
    // which shrinks statement reports dramatically inside the PDF.
    const hostWidth = Math.ceil(host.getBoundingClientRect().width);

    // Ensure all images (such as logos and check photos) are fully loaded before measuring height (with a 1.5s timeout safety).
    try {
      const images = Array.from(host.querySelectorAll('img'));
      const loadPromises = images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      });
      await Promise.race([
        Promise.all(loadPromises),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    } catch { /* ignore image loading check errors */ }

    // Add a 60px safety buffer to totalHeight to prevent rounding/rendering margin issues from clipping the summary row.
    // The larger buffer ensures footer rows (totals, closing balance) are fully captured.
    const totalHeight = Math.max(Math.ceil(clone.scrollHeight), Math.ceil(clone.getBoundingClientRect().height), 1) + 60;

    // Calculate proper slice height to fit A4 pages
    // Account for the aspect ratio and ensure content fits within printable area
    const aspectRatio = printableWidth / printableHeight;
    const naturalSliceHeight = Math.floor((printableHeight * hostWidth) / printableWidth);

    // Set reasonable maximum slice height to prevent memory issues while ensuring full pages
    const maxSliceHeight = Math.floor(2000 / Math.max(scale / 2, 1));
    const pageSliceHeight = Math.max(1, Math.min(naturalSliceHeight, maxSliceHeight));

    const estimatedPageCount = Math.max(1, Math.ceil(totalHeight / pageSliceHeight));
    updateStatementFooterMeta(clone, {
      printDate: formatStatementPrintDate(options.lang || 'ar'),
      pageCount: estimatedPageCount
    });
    let renderedHeight = 0;
    let pageIndex = 0;

    while (renderedHeight < totalHeight) {
      const sliceHeight = Math.min(pageSliceHeight, totalHeight - renderedHeight);
      const captureHeight = Math.ceil(sliceHeight + (padding * 2));
      viewport.style.height = `${sliceHeight}px`;
      host.style.height = `${captureHeight}px`;
      clone.style.transform = `translateY(-${renderedHeight}px)`;

      await waitForRenderPass(1, 120);

      // Temporarily set host opacity to 1 before capturing so html2canvas renders it with full visibility
      host.style.opacity = '1';

      const canvas = await html2canvas(host, {
        backgroundColor,
        scale,
        useCORS: true,
        allowTaint: false,
        width: hostWidth,
        height: captureHeight,
        windowWidth: hostWidth,
        windowHeight: captureHeight,
        scrollX: 0,
        scrollY: 0,
        logging: false,
        onclone: (clonedDoc) => {
          const clonedHost = clonedDoc.querySelector('.pdf-export-host') as HTMLElement | null;
          if (clonedHost) {
            clonedHost.style.opacity = '1';
            clonedHost.style.visibility = 'visible';
          }
        }
      });

      // Restore opacity back to 0.02 so it remains hidden from the user
      host.style.opacity = '0.02';

      if (pageIndex > 0) {
        pdf.addPage();
      }

      // Calculate image dimensions to fit properly on A4 page with margins
      const imageWidth = printableWidth;
      const imageHeight = (canvas.height * printableWidth) / canvas.width;

      // Ensure image fits within printable height, scale down if necessary
      const finalImageHeight = Math.min(imageHeight, printableHeight);
      const finalImageWidth = imageHeight > printableHeight
        ? (canvas.width * printableHeight) / canvas.height
        : imageWidth;

      // Center the image if it doesn't fill the full width
      const xPosition = margin + (printableWidth - finalImageWidth) / 2;

      pdf.addImage(
        canvas.toDataURL('image/png', 0.95),
        'PNG',
        xPosition,
        margin,
        finalImageWidth,
        finalImageHeight,
        undefined,
        'FAST'
      );

      renderedHeight += sliceHeight;
      pageIndex += 1;
    }

    clone.style.transform = 'translateY(0)';
    host.style.height = 'auto';

    const fileName = options.fileName.endsWith('.pdf') ? options.fileName : `${options.fileName}.pdf`;
    const blob = pdf.output('blob');
    return new File([blob], sanitizeDownloadName(fileName), { type: 'application/pdf' });
  } finally {
    host.remove();
  }
};

export const downloadElementAsPdf = async (element: HTMLElement | null, options: PdfSnapshotOptions) => {
  const file = await buildElementPdfFile(element, options);
  if (!file) return false;
  downloadBlobFile(file, file.name);
  return true;
};
