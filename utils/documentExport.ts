import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface HtmlSnapshotOptions {
  title: string;
  fileName: string;
  dir?: 'rtl' | 'ltr';
  lang?: string;
}

interface PdfSnapshotOptions extends HtmlSnapshotOptions {
  padding?: number;
  backgroundColor?: string;
  canvasScale?: number;
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

export const downloadTextFile = (content: string, fileName: string, mimeType = 'text/plain;charset=utf-8') => {
  triggerDownload(new Blob([content], { type: mimeType }), fileName);
};

const normalizeText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();

const stripInteractiveElements = (element: HTMLElement) => {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-document-actions], script, style, button').forEach(node => node.remove());
  clone.querySelectorAll('input, textarea, select').forEach(node => {
    const replacement = document.createElement('span');
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      replacement.textContent = node.value || node.placeholder || '';
    } else if (node instanceof HTMLSelectElement) {
      replacement.textContent = node.selectedOptions[0]?.textContent || '';
    }
    replacement.className = 'inline-block min-h-[1em]';
    node.replaceWith(replacement);
  });
  return clone;
};

const extractRowsFromTable = (table: HTMLTableElement): string[][] => {
  const rows = Array.from(table.querySelectorAll('tr')).map(row =>
    Array.from(row.querySelectorAll('th, td'))
      .map(cell => normalizeText(cell.textContent))
      .filter(Boolean)
  );
  return rows.filter(row => row.length > 0);
};

const escapeCsvValue = (value: string) => `"${value.replace(/"/g, '""')}"`;

export const exportElementAsCsv = (element: HTMLElement | null, fileName: string) => {
  if (!element) return false;
  const clone = stripInteractiveElements(element);
  const tables = Array.from(clone.querySelectorAll('table'));
  let rows: string[][] = [];

  if (tables.length > 0) {
    tables.forEach((table, index) => {
      const tableRows = extractRowsFromTable(table);
      if (tableRows.length > 0) {
        rows.push(...tableRows);
        if (index < tables.length - 1) rows.push([]);
      }
    });
  } else {
    rows = clone.innerText
      .split('\n')
      .map(line => normalizeText(line))
      .filter(Boolean)
      .map(line => [line]);
  }

  if (rows.length === 0) return false;

  const csv = '\uFEFF' + rows.map(row => row.map(escapeCsvValue).join(',')).join('\n');
  downloadTextFile(csv, fileName.endsWith('.csv') ? fileName : `${fileName}.csv`, 'text/csv;charset=utf-8');
  return true;
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

  clone.style.width = `${sourceWidth}px`;
  clone.style.boxSizing = 'border-box';
  expandSnapshotLayout(clone);

  host.appendChild(clone);
  document.body.appendChild(host);

  return { host, clone, backgroundColor, padding };
};

export const buildElementPdfFile = async (element: HTMLElement | null, options: PdfSnapshotOptions): Promise<File | null> => {
  if (!element || typeof window === 'undefined') return null;

  const { host, backgroundColor, padding } = prepareSnapshotHost(element, options);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const canvas = await html2canvas(host, {
      backgroundColor,
      scale: options.canvasScale ?? Math.min(2, Math.max(window.devicePixelRatio || 1, 1.5)),
      useCORS: true,
      width: Math.ceil(host.scrollWidth),
      height: Math.ceil(host.scrollHeight),
      windowWidth: Math.ceil(host.scrollWidth),
      windowHeight: Math.ceil(host.scrollHeight),
      scrollX: 0,
      scrollY: 0
    });

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
    const imageWidth = printableWidth;
    const imageHeight = (canvas.height * imageWidth) / canvas.width;
    const imageData = canvas.toDataURL('image/png');
    let renderedHeight = 0;

    pdf.addImage(imageData, 'PNG', margin, margin, imageWidth, imageHeight, undefined, 'FAST');
    renderedHeight += printableHeight;

    while (renderedHeight < imageHeight) {
      pdf.addPage();
      pdf.addImage(imageData, 'PNG', margin, margin - renderedHeight, imageWidth, imageHeight, undefined, 'FAST');
      renderedHeight += printableHeight;
    }

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
