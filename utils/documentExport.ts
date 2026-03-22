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
}

interface PdfSnapshotOptions extends HtmlSnapshotOptions {
  padding?: number;
  backgroundColor?: string;
  canvasScale?: number;
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

export const settleElementBeforeSnapshot = async (element: HTMLElement | null) => {
  if (!element || typeof window === 'undefined' || typeof document === 'undefined') return;

  const activeElement = document.activeElement as HTMLElement | null;
  if (activeElement && element.contains(activeElement) && typeof activeElement.blur === 'function') {
    activeElement.blur();
  }

  await new Promise<void>(resolve => {
    window.setTimeout(() => {
      window.requestAnimationFrame(() => resolve());
    }, 0);
  });
};

const normalizeText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();

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
  clone.querySelectorAll('[data-document-actions], script, style, button').forEach(node => node.remove());
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
  const stylesMarkup = collectPrintStylesMarkup();
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  const autoCloseScript = options.autoCloseAfterPrint === false
    ? ''
    : 'window.onafterprint = () => window.close();';

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
      .financial-reports-page.statement-report-active .statement-report-table th:nth-child(1),
      .financial-reports-page.statement-report-active .statement-report-table td:nth-child(1) {
        width: 12% !important;
      }
      .financial-reports-page.statement-report-active .statement-report-table th:nth-child(2),
      .financial-reports-page.statement-report-active .statement-report-table td:nth-child(2) {
        width: 48% !important;
      }
      .financial-reports-page.statement-report-active .statement-report-table th:nth-child(3),
      .financial-reports-page.statement-report-active .statement-report-table td:nth-child(3),
      .financial-reports-page.statement-report-active .statement-report-table th:nth-child(4),
      .financial-reports-page.statement-report-active .statement-report-table td:nth-child(4),
      .financial-reports-page.statement-report-active .statement-report-table th:nth-child(5),
      .financial-reports-page.statement-report-active .statement-report-table td:nth-child(5) {
        width: 13.33% !important;
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
        table-layout: auto !important;
        border-collapse: collapse !important;
        break-inside: auto !important;
        page-break-inside: auto !important;
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
      .report-print-content > *,
      .report-print-content tr,
      .report-print-content .bg-white,
      .report-print-content .report-print-highlight {
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
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
      .report-print-statement .statement-report-table th:nth-child(1),
      .report-print-statement .statement-report-table td:nth-child(1) {
        width: 12% !important;
      }
      .report-print-statement .statement-report-table th:nth-child(2),
      .report-print-statement .statement-report-table td:nth-child(2) {
        width: 48% !important;
      }
      .report-print-statement .statement-report-table th:nth-child(3),
      .report-print-statement .statement-report-table td:nth-child(3),
      .report-print-statement .statement-report-table th:nth-child(4),
      .report-print-statement .statement-report-table td:nth-child(4),
      .report-print-statement .statement-report-table th:nth-child(5),
      .report-print-statement .statement-report-table td:nth-child(5) {
        width: 13.33% !important;
      }
      .dir-ltr { direction: ltr; }
      @media print {
        @page {
          margin: 10mm;
        }
        body {
          padding: 8px;
          background: #ffffff;
        }
        .report-print-content .report-print-table-section {
          break-inside: auto !important;
          page-break-inside: auto !important;
        }
      }
    </style>
  </head>
  <body>
    ${clone.outerHTML}
    <script>
      window.onload = () => { setTimeout(() => window.print(), 120); };
      ${autoCloseScript}
    </script>
  </body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  return true;
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
};

const prepareSnapshotHost = (element: HTMLElement, options: PdfSnapshotOptions) => {
  const dir = options.dir || 'rtl';
  const lang = options.lang || (dir === 'rtl' ? 'ar' : 'en');
  const padding = options.padding ?? 16;
  const backgroundColor = options.backgroundColor || '#ffffff';
  const clone = stripInteractiveElements(element);
  const sourceWidth = Math.max(element.scrollWidth, Math.ceil(element.getBoundingClientRect().width), 720);
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
  document.body.appendChild(host);

  return { host, viewport, clone, backgroundColor, padding };
};

export const buildElementPdfFile = async (element: HTMLElement | null, options: PdfSnapshotOptions): Promise<File | null> => {
  if (!element || typeof window === 'undefined') return null;

  const { host, viewport, clone, backgroundColor, padding } = prepareSnapshotHost(element, options);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
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
    const hostWidth = Math.ceil(host.scrollWidth);
    const totalHeight = Math.max(Math.ceil(clone.scrollHeight), Math.ceil(clone.getBoundingClientRect().height), 1);
    const naturalSliceHeight = Math.floor(((printableHeight * hostWidth) / printableWidth) - (padding * 2));
    const maxSliceHeight = Math.max(960, Math.floor(1800 / Math.max(scale, 1)));
    const pageSliceHeight = Math.max(1, Math.min(naturalSliceHeight, maxSliceHeight));
    let renderedHeight = 0;
    let pageIndex = 0;

    while (renderedHeight < totalHeight) {
      const sliceHeight = Math.min(pageSliceHeight, totalHeight - renderedHeight);
      viewport.style.height = `${sliceHeight}px`;
      clone.style.transform = `translateY(-${renderedHeight}px)`;

      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));

      const canvas = await html2canvas(host, {
        backgroundColor,
        scale,
        useCORS: true,
        width: hostWidth,
        height: Math.ceil(host.scrollHeight),
        windowWidth: hostWidth,
        windowHeight: Math.ceil(host.scrollHeight),
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
