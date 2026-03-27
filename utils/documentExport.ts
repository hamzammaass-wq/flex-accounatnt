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

  const clone = stripInteractiveElements(element);
  expandSnapshotLayout(clone);

  const dir = options.dir || 'rtl';
  const lang = options.lang || (dir === 'rtl' ? 'ar' : 'en');
  const pageOrientation = options.pageOrientation || 'portrait';
  const hasStatementPrintFooter = Boolean(clone.querySelector('.statement-classic-sheet'));
  const stylesMarkup = collectPrintStylesMarkup();
  const printWindow = options.targetWindow && !options.targetWindow.closed
    ? options.targetWindow
    : window.open('', '_blank');
  if (!printWindow) return false;

  const autoCloseScript = options.autoCloseAfterPrint === false
    ? ''
    : 'window.onafterprint = () => window.close();';
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
        background: #f8fafc;
        color: #0f172a;
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
      .report-print-statement .statement-inline-table {
        width: 100% !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
      }
      .report-print-statement .statement-inline-table th,
      .report-print-statement .statement-inline-table td {
        padding: 6px 7px !important;
        font-size: 10px !important;
        line-height: 1.4 !important;
      }
      .report-print-statement .statement-inline-value {
        white-space: nowrap !important;
        font-variant-numeric: tabular-nums !important;
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
          size: ${pageOrientation};
          margin: ${pageTopMarginMm}mm 10mm ${pageBottomMarginMm}mm;
        }
        body {
          padding: 8px;
          background: #ffffff;
        }
        .report-print-content .report-print-table-section {
          break-inside: auto !important;
          page-break-inside: auto !important;
        }
        .statement-print-footer {
          position: fixed;
          left: 10mm;
          right: 10mm;
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

      window.onload = async () => {
        try {
          if (document.fonts?.ready) {
            await Promise.race([
              document.fonts.ready,
              new Promise(resolve => setTimeout(resolve, 800))
            ]);
          }
        } catch {}
        await waitForRenderPass(2, 140);
        syncStatementFooterMeta();
        window.focus();
        setTimeout(() => window.print(), 120);
      };
      ${autoCloseScript}
    </script>
  </body>
</html>`;

  try {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    return true;
  } catch {
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
};

const prepareSnapshotHost = (element: HTMLElement, options: PdfSnapshotOptions) => {
  const dir = options.dir || 'rtl';
  const lang = options.lang || (dir === 'rtl' ? 'ar' : 'en');
  const padding = options.padding ?? 16;
  const backgroundColor = options.backgroundColor || '#ffffff';
  const clone = stripInteractiveElements(element);
  const hasClassicStatementLayout = clone.classList.contains('statement-classic-sheet')
    || Boolean(clone.querySelector('.statement-classic-sheet'));
  const liveElementWidth = Math.max(Math.ceil(element.getBoundingClientRect().width), 360);
  const minRenderWidth = Math.max(
    360,
    options.minRenderWidth ?? (hasClassicStatementLayout ? liveElementWidth : 720)
  );
  const orientation = options.orientation || 'portrait';
  const defaultMaxRenderWidth = hasClassicStatementLayout
    ? Math.max(minRenderWidth, liveElementWidth)
    : (orientation === 'landscape' ? 1360 : 980);
  const maxRenderWidth = Math.max(minRenderWidth, options.maxRenderWidth ?? defaultMaxRenderWidth);
  const measuredWidth = Math.max(element.scrollWidth, Math.ceil(element.getBoundingClientRect().width), minRenderWidth);
  const sourceWidth = Math.min(measuredWidth, maxRenderWidth);
  const host = document.createElement('div');
  const viewport = document.createElement('div');

  host.lang = lang;
  host.dir = dir;
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.zIndex = '-1';
  host.style.pointerEvents = 'none';
  host.style.background = backgroundColor;
  host.style.padding = `${padding}px`;
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
  // Ensure Tajawal Arabic font is explicitly available to the snapshot host
  const fontFace = document.createElement('style');
  const snapshotSupportStyles = hasClassicStatementLayout
    ? ''
    : `
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: ${dir === 'rtl' ? 'right' : 'left'}; vertical-align: top; font-size: 12px; line-height: 1.45; white-space: normal; word-break: break-word; overflow-wrap: anywhere; }
    .statement-mobile-viewport,
    .statement-mobile-canvas,
    .directory-statement-content {
      overflow: visible !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      height: auto !important;
      max-height: none !important;
      transform: none !important;
      zoom: 1 !important;
    }
    .directory-statement-table,
    .statement-report-table {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      table-layout: fixed !important;
    }
    .directory-statement-table th,
    .directory-statement-table td,
    .statement-report-table th,
    .statement-report-table td {
      font-size: 12px !important;
      line-height: 1.6 !important;
      padding: 8px 7px !important;
      white-space: normal !important;
      word-break: break-word !important;
      overflow-wrap: anywhere !important;
    }
    .directory-statement-description,
    .directory-statement-description-text,
    .statement-report-description {
      font-size: 12px !important;
      line-height: 1.72 !important;
      font-weight: 700 !important;
    }
    .directory-statement-inline-detail,
    .statement-inline-detail {
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
    }
    .directory-statement-inline-title,
    .statement-inline-detail-title,
    .statement-inline-detail-footer {
      font-size: 10px !important;
      line-height: 1.35 !important;
    }
    .directory-statement-detail-table th,
    .directory-statement-detail-table td,
    .statement-inline-table th,
    .statement-inline-table td {
      font-size: 10px !important;
      line-height: 1.35 !important;
      padding: 6px 7px !important;
    }
    .directory-statement-detail-table .statement-inline-value,
    .statement-inline-value {
      white-space: nowrap !important;
      word-break: keep-all !important;
      overflow-wrap: normal !important;
      font-variant-numeric: tabular-nums !important;
    }
  `;
  fontFace.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=block');
    * { font-family: ${dir === 'rtl' ? "'Tajawal', Arial, sans-serif" : "'Segoe UI', Arial, sans-serif"}; }
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
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = Math.max(18, padding);
    const printableWidth = pageWidth - (margin * 2);
    const printableHeight = pageHeight - (margin * 2);
    const scale = options.canvasScale ?? Math.min(2, Math.max(window.devicePixelRatio || 1, 1.5));
    // Use the bounded layout width for capture. scrollWidth can balloon when a child overflows,
    // which shrinks statement reports dramatically inside the PDF.
    const hostWidth = Math.ceil(host.getBoundingClientRect().width);
    const totalHeight = Math.max(Math.ceil(clone.scrollHeight), Math.ceil(clone.getBoundingClientRect().height), 1);
    const naturalSliceHeight = Math.floor(((printableHeight * hostWidth) / printableWidth) - (padding * 2));
    const maxSliceHeight = Math.max(960, Math.floor(1800 / Math.max(scale, 1)));
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

      await waitForRenderPass(1, 100);

      const canvas = await html2canvas(host, {
        backgroundColor,
        scale,
        useCORS: true,
        width: hostWidth,
        height: captureHeight,
        windowWidth: hostWidth,
        windowHeight: captureHeight,
        scrollX: 0,
        scrollY: 0
      });

      if (pageIndex > 0) {
        pdf.addPage();
      }

      const imageWidth = printableWidth;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, imageWidth, imageHeight, undefined, 'FAST');

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
