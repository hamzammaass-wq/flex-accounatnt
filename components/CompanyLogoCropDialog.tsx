import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Move, RotateCcw, X, ZoomIn } from 'lucide-react';
import type { CompanySettings } from '../types';
import {
  clampLogoOffset,
  getLogoCropDrawRect,
  getLogoScaledSize,
  type LogoCropImageSize,
  type LogoCropOffset
} from '../utils/logoCrop';
import ResponsiveDialog from './layout/ResponsiveDialog';

const EXPORT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  origin: LogoCropOffset;
};

interface CompanyLogoCropDialogProps {
  open: boolean;
  imageSrc: string | null;
  language?: CompanySettings['language'];
  onClose: () => void;
  onApply: (logoUrl: string) => void;
}

const CompanyLogoCropDialog: React.FC<CompanyLogoCropDialogProps> = ({
  open,
  imageSrc,
  language = 'AR',
  onClose,
  onApply
}) => {
  const isEnglish = language !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [imageSize, setImageSize] = useState<LogoCropImageSize | null>(null);
  const [frameSize, setFrameSize] = useState(288);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<LogoCropOffset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    const updateFrameSize = () => {
      const nextFrameSize = previewRef.current?.clientWidth || 288;
      setFrameSize(nextFrameSize);
    };

    updateFrameSize();

    if (typeof ResizeObserver !== 'undefined' && previewRef.current) {
      const observer = new ResizeObserver(() => updateFrameSize());
      observer.observe(previewRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateFrameSize);
    return () => window.removeEventListener('resize', updateFrameSize);
  }, [open]);

  useEffect(() => {
    if (!open || !imageSrc) {
      imageRef.current = null;
      setImageSize(null);
      setZoom(MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
      setStatusMessage('');
      setIsSaving(false);
      return;
    }

    let disposed = false;
    setStatusMessage('');
    setIsSaving(false);

    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      imageRef.current = image;
      setImageSize({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height
      });
      setZoom(MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
    };
    image.onerror = () => {
      if (disposed) return;
      imageRef.current = null;
      setImageSize(null);
      setStatusMessage(tr('تعذر تحميل الصورة. حاول اختيار ملف آخر.', 'Could not load the image. Try another file.'));
    };
    image.src = imageSrc;

    return () => {
      disposed = true;
      imageRef.current = null;
    };
  }, [open, imageSrc, language]);

  useEffect(() => {
    if (!imageSize) return;
    setOffset((prev) => {
      const next = clampLogoOffset(frameSize, imageSize, zoom, prev);
      if (next.x === prev.x && next.y === prev.y) return prev;
      return next;
    });
  }, [frameSize, imageSize, zoom]);

  const baseSize = useMemo(
    () => (imageSize ? getLogoScaledSize(frameSize, imageSize, MIN_ZOOM) : null),
    [frameSize, imageSize]
  );

  const clampedOffset = useMemo(
    () => (imageSize ? clampLogoOffset(frameSize, imageSize, zoom, offset) : offset),
    [frameSize, imageSize, offset, zoom]
  );

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  const applyZoom = (nextZoom: number) => {
    const normalizedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    setZoom(normalizedZoom);
    if (!imageSize) return;
    setOffset((prev) => clampLogoOffset(frameSize, imageSize, normalizedZoom, prev));
  };

  const resetCrop = () => {
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
    setStatusMessage('');
  };

  const endDrag = (pointerId?: number) => {
    if (pointerId !== undefined && dragStateRef.current?.pointerId !== pointerId) return;
    dragStateRef.current = null;
    setIsDragging(false);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!imageSize || !baseSize) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: clampedOffset
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!imageSize || !dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;
    const nextOffset = clampLogoOffset(frameSize, imageSize, zoom, {
      x: dragStateRef.current.origin.x + (event.clientX - dragStateRef.current.startX),
      y: dragStateRef.current.origin.y + (event.clientY - dragStateRef.current.startY)
    });
    setOffset(nextOffset);
  };

  const handleApply = () => {
    if (!imageRef.current || !imageSize) return;

    setIsSaving(true);
    setStatusMessage('');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = EXPORT_SIZE;
      canvas.height = EXPORT_SIZE;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas context is unavailable.');
      }

      const drawRect = getLogoCropDrawRect(EXPORT_SIZE, frameSize, imageSize, zoom, clampedOffset);

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(imageRef.current, drawRect.x, drawRect.y, drawRect.width, drawRect.height);

      onApply(canvas.toDataURL('image/png'));
    } catch (error) {
      console.error(error);
      setStatusMessage(tr('تعذر حفظ الشعار بعد القص.', 'Could not save the cropped logo.'));
      setIsSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={isSaving ? undefined : onClose}
      size="lg"
      zIndexClassName="z-[320]"
      backdropClassName="bg-slate-950/70 backdrop-blur-sm"
      panelClassName="bg-white rounded-[2rem] p-4 sm:p-6 shadow-2xl"
      closeOnBackdrop={!isSaving}
    >
      <div dir={isEnglish ? 'ltr' : 'rtl'} className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-900">{tr('ضبط قص شعار الشركة', 'Adjust Company Logo')}</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {tr(
                'اسحب الصورة وحدد مستوى التكبير حتى يظهر الشعار بالشكل المناسب داخل الإطار.',
                'Drag the image and adjust zoom until the logo sits nicely inside the frame.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={tr('إغلاق', 'Close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            <div
              ref={previewRef}
              className={`relative mx-auto aspect-square w-full max-w-[22rem] overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc,#eef2ff)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] touch-none select-none ${imageSize ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(event) => endDrag(event.pointerId)}
              onPointerCancel={(event) => endDrag(event.pointerId)}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(255,255,255,0.3)_50%,_rgba(226,232,240,0.75))]" />

              {imageSrc && imageSize && baseSize ? (
                <div
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: `${baseSize.width}px`,
                    height: `${baseSize.height}px`,
                    transform: `translate(calc(-50% + ${clampedOffset.x}px), calc(-50% + ${clampedOffset.y}px))`
                  }}
                >
                  <img
                    src={imageSrc}
                    alt={tr('معاينة الشعار', 'Logo preview')}
                    className="h-full w-full pointer-events-none object-contain"
                    draggable={false}
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: 'center center'
                    }}
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-bold text-slate-400">
                  {statusMessage || tr('جارٍ تجهيز الصورة...', 'Preparing image...')}
                </div>
              )}

              <div className="pointer-events-none absolute inset-[8%] rounded-[1.5rem] border border-dashed border-slate-300/80" />
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/70" />
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/70" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
              {tr(
                'يتم حفظ نسخة مربعة من الشعار بعد القص، وهذا يساعد على ظهوره بوضوح في الواجهة.',
                'A square version of the logo will be saved after cropping so it appears clearly across the app.'
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                <Move className="h-4 w-4 text-sky-600" />
                <span>{tr('تحريك الصورة', 'Move Image')}</span>
              </div>
              <p className="mt-2 text-[11px] font-bold leading-5 text-slate-500">
                {tr(
                  'اسحب الصورة داخل الإطار لتحديد المكان الأنسب للشعار.',
                  'Drag the image inside the frame to place the logo where you want it.'
                )}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                  <ZoomIn className="h-4 w-4 text-indigo-600" />
                  <span>{tr('التكبير', 'Zoom')}</span>
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700">{zoomLabel}</span>
              </div>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step="0.01"
                value={zoom}
                onChange={(event) => applyZoom(Number(event.target.value))}
                className="w-full accent-indigo-600"
              />
              <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span>{tr('إظهار كامل', 'Show Full')}</span>
                <span>{tr('قص أقرب', 'Crop Tighter')}</span>
              </div>
            </div>

            {imageSize && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold text-slate-500">
                {tr('أبعاد الصورة الأصلية', 'Original size')}: {imageSize.width} x {imageSize.height}
              </div>
            )}

            {statusMessage && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] font-bold text-rose-700">
                {statusMessage}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={resetCrop}
                disabled={!imageSize || isSaving}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                {tr('إعادة الضبط', 'Reset')}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tr('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!imageSize || isSaving}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? tr('جارٍ الحفظ...', 'Saving...') : tr('اعتماد الشعار', 'Apply Logo')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
};

export default CompanyLogoCropDialog;
