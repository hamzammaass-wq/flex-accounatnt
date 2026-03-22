import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, MessageCircle, MessageSquareText, MoreVertical, Printer, Save, Share2, FileText } from 'lucide-react';

interface DocumentActionsProps {
  title: string;
  shareText: string;
  smsText?: string;
  whatsappText?: string;
  notificationPhone?: string;
  isEnglish?: boolean;
  tr: (ar: string, en: string) => string;
  onPrint: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  onSave?: () => void | Promise<void>;
  onExcel?: () => void | Promise<void>;
  onSms?: () => void | Promise<void>;
  onWhatsapp?: () => void | Promise<void>;
  saveTitle?: string;
  saveButtonIcon?: 'save' | 'fileText';
  className?: string;
  variant?: 'light' | 'dark';
  showSaveButton?: boolean;
  menuPlacement?: 'top' | 'bottom';
}

const DocumentActions: React.FC<DocumentActionsProps> = ({
  title,
  shareText,
  smsText,
  whatsappText,
  notificationPhone,
  isEnglish = false,
  tr,
  onPrint,
  onShare,
  onSave,
  onExcel,
  onSms,
  onWhatsapp,
  saveTitle,
  saveButtonIcon = 'save',
  className = '',
  variant = 'light',
  showSaveButton = true,
  menuPlacement = 'bottom'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updateMenuPosition = () => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const panelWidth = 192;
    const estimatedPanelHeight = 220;
    const spacing = 8;

    let left = isEnglish ? rect.left : rect.right - panelWidth;
    left = Math.max(spacing, Math.min(left, window.innerWidth - panelWidth - spacing));

    let top = menuPlacement === 'top'
      ? rect.top - estimatedPanelHeight - spacing
      : rect.bottom + spacing;

    if (menuPlacement === 'bottom' && top + estimatedPanelHeight > window.innerHeight - spacing) {
      top = rect.top - estimatedPanelHeight - spacing;
    }

    if (menuPlacement === 'top' && top < spacing) {
      top = rect.bottom + spacing;
    }

    top = Math.max(spacing, Math.min(top, window.innerHeight - estimatedPanelHeight - spacing));
    setMenuStyle({ top, left });
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();
    const handleViewportChange = () => updateMenuPosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, isEnglish, menuPlacement]);

  const runAsyncAction = async (action: () => void | Promise<void>) => {
    setIsOpen(false);
    setIsBusy(true);
    try {
      await action();
    } catch {
      alert(tr('تعذر تنفيذ هذا الإجراء الآن.', 'Could not complete this action right now.'));
    } finally {
      setIsBusy(false);
    }
  };

  const normalizePhoneForDirectMessage = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('+')) {
      return raw.replace(/[^\d]/g, '');
    }
    const digitsOnly = raw.replace(/[^\d]/g, '');
    if (digitsOnly.startsWith('00')) {
      return digitsOnly.slice(2);
    }
    return /^\d{8,15}$/.test(digitsOnly) && !digitsOnly.startsWith('0') ? digitsOnly : '';
  };

  const openExternalUrl = (url: string, blockedMessage: string) => {
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (popup) return;
    try {
      window.location.href = url;
      return;
    } catch {
      alert(blockedMessage);
    }
  };

  const handleShare = async () => {
    if (onShare) {
      await runAsyncAction(onShare);
      return;
    }
    await runAsyncAction(async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title, text: shareText });
          return;
        } catch {
          // Fall back to clipboard or prompt below.
        }
      }

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(shareText);
          alert(tr('تم نسخ المحتوى إلى الحافظة.', 'Content copied to clipboard.'));
          return;
        } catch {
          // Fall through to prompt below.
        }
      }

      window.prompt(tr('انسخ المحتوى يدويًا', 'Copy the content manually'), shareText);
    });
  };

  const handleSms = async () => {
    if (onSms) {
      await runAsyncAction(onSms);
      return;
    }
    const smsBody = smsText || shareText;
    const directPhone = String(notificationPhone || '').trim().replace(/\s+/g, '');
    const smsTarget = directPhone ? `sms:${directPhone}` : 'sms:';
    setIsOpen(false);
    openExternalUrl(
      `${smsTarget}?&body=${encodeURIComponent(smsBody)}`,
      tr('تعذر فتح تطبيق الرسائل من المتصفح الحالي.', 'Unable to open the SMS app from the current browser.')
    );
  };

  const handleWhatsapp = async () => {
    await runAsyncAction(async () => {
      if (onWhatsapp) {
        await onWhatsapp();
        return;
      }
      const message = whatsappText || smsText || shareText;
      const directPhone = normalizePhoneForDirectMessage(notificationPhone);
      const targetUrl = directPhone
        ? `https://wa.me/${directPhone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      openExternalUrl(
        targetUrl,
        tr('تعذر فتح واتساب. تأكد من السماح بالنوافذ المنبثقة.', 'Unable to open WhatsApp. Please allow pop-ups.')
      );
    });
  };

  const neutralButtonClass =
    variant === 'dark'
      ? 'border-white/10 bg-white/10 text-white/90 hover:bg-white/15'
      : 'border-gray-100 bg-white text-slate-500 hover:bg-gray-50 shadow-sm';
  const saveButtonClass =
    variant === 'dark'
      ? 'border-blue-400/20 bg-blue-500/15 text-blue-100 hover:bg-blue-500/25'
      : 'border-indigo-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 shadow-sm';
  const printButtonClass =
    variant === 'dark'
      ? 'border-emerald-400/20 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25'
      : 'border-orange-100 bg-orange-50 text-orange-500 hover:bg-orange-100 shadow-sm';
  const menuPanelClass =
    variant === 'dark'
      ? 'border border-white/10 bg-slate-900/95 text-white shadow-2xl'
      : 'border border-gray-100 bg-white text-slate-700 shadow-xl';
  const disabledButtonClass = isBusy ? 'opacity-60 cursor-not-allowed' : '';
  const SaveButtonIcon = saveButtonIcon === 'fileText' ? FileText : Save;

  return (
    <div
      ref={containerRef}
      data-document-actions
      className={`relative flex items-center gap-2 ${isEnglish ? '' : 'flex-row-reverse'} ${className}`}
    >
      <button
        type="button"
        title={tr('طباعة', 'Print')}
        onClick={() => { void runAsyncAction(onPrint); }}
        disabled={isBusy}
        className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-all ${printButtonClass} ${disabledButtonClass}`}
      >
        <Printer size={16} />
      </button>

      {showSaveButton && (onSave || onExcel) && (
        <button
          type="button"
          title={saveTitle || tr('تنزيل', 'Download')}
          onClick={() => {
            const primaryAction = onSave || onExcel;
            if (!primaryAction) return;
            void runAsyncAction(primaryAction);
          }}
          disabled={isBusy}
          className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-all ${saveButtonClass} ${disabledButtonClass}`}
        >
          <SaveButtonIcon size={16} />
        </button>
      )}

      <button
        type="button"
        title={tr('خيارات إضافية', 'More actions')}
        onClick={() =>
          setIsOpen(prev => {
            const next = !prev;
            if (next) {
              window.setTimeout(updateMenuPosition, 0);
            }
            return next;
          })
        }
        disabled={isBusy}
        className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-all ${neutralButtonClass} ${disabledButtonClass}`}
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ top: `${menuStyle.top}px`, left: `${menuStyle.left}px` }}
          className={`fixed z-[450] w-48 rounded-2xl p-2 ${menuPanelClass}`}
        >
          <button
            type="button"
            onClick={() => {
              if (!onExcel) return;
              void runAsyncAction(onExcel);
            }}
            className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-sm font-black transition-colors ${
              onExcel ? (variant === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-50') : 'opacity-40 cursor-not-allowed'
            }`}
            disabled={!onExcel || isBusy}
          >
            <span>{tr('إكسل', 'Excel')}</span>
            <FileSpreadsheet size={16} />
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={isBusy}
            className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-sm font-black transition-colors ${
              isBusy ? 'opacity-50 cursor-not-allowed' : variant === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-50'
            }`}
          >
            <span>{tr('مشاركة', 'Share')}</span>
            <Share2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => { void handleSms(); }}
            disabled={isBusy}
            className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-sm font-black transition-colors ${
              isBusy ? 'opacity-50 cursor-not-allowed' : variant === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-50'
            }`}
          >
            <span>{tr('إشعار رسالة', 'SMS')}</span>
            <MessageSquareText size={16} />
          </button>
          <button
            type="button"
            onClick={handleWhatsapp}
            disabled={isBusy}
            className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-sm font-black transition-colors ${
              isBusy ? 'opacity-50 cursor-not-allowed' : variant === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-50'
            }`}
          >
            <span>{tr('إشعار واتساب', 'WhatsApp')}</span>
            <MessageCircle size={16} />
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DocumentActions;
