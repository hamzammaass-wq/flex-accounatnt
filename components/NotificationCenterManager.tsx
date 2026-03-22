import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Clock4,
  AlertTriangle,
  Package,
  ShoppingCart,
  FileClock,
  CalendarRange,
  ShieldAlert,
} from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { getInvoiceRemainingBase } from '../utils/invoiceSettlement';
import { getDateLocale, getNumberLocale } from '../utils/i18n';
import { TransactionType } from '../types';
import EnglishDateInput from './EnglishDateInput';
import { isStockProduct } from '../utils/productKind';

type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
type AlertSource = 'SYSTEM' | 'MANUAL';
type AlertKind =
  | 'CHECK_DUE_SOON'
  | 'CHECK_DUE_NOW'
  | 'LOW_STOCK'
  | 'ORDER_NOW'
  | 'EXPIRY'
  | 'OVERDUE_INVOICE'
  | 'CONTRACT_EXPIRY'
  | 'MANUAL';

interface ManualNotification {
  id: string;
  title: string;
  note?: string;
  severity: AlertSeverity;
  dueDate?: string;
  createdAt: string;
  done: boolean;
}

interface FeedAlert {
  id: string;
  source: AlertSource;
  kind: AlertKind;
  title: string;
  note?: string;
  severity: AlertSeverity;
  dueDate?: string;
  createdAt: string;
  done: boolean;
  entityLabel?: string;
}

const CHECK_PRE_ALERT_DAYS = 5;
const MANUAL_ALERTS_STORAGE_PREFIX = 'smart-acc-manual-alerts';
const NOTIFIED_ALERTS_STORAGE_PREFIX = 'smart-acc-alert-notified';

const normalizeIso = (value?: string): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const diffDays = (targetIso: string, fromIso: string): number => {
  const target = new Date(targetIso);
  const from = new Date(fromIso);
  if (Number.isNaN(target.getTime()) || Number.isNaN(from.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((target.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
};

const severityRank: Record<AlertSeverity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  INFO: 1,
};

const NotificationCenterManager: React.FC = () => {
  const {
    companySettings,
    currentCompanyId,
    checks,
    products,
    invoices,
    invoiceSettlements,
    contacts,
    employees,
    employeeContracts,
    baseCurrency,
  } = useAccounting();
  const appLanguage = companySettings.language ?? 'AR';
  const tr = (ar: string, en: string) => (appLanguage === 'AR' ? ar : en);

  const [manualAlerts, setManualAlerts] = useState<ManualNotification[]>([]);
  const [manualTitle, setManualTitle] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualDueDate, setManualDueDate] = useState('');
  const [manualSeverity, setManualSeverity] = useState<AlertSeverity>('WARNING');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | AlertSource>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | AlertSeverity>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'DONE'>('ALL');
  const [notifiedAlertIds, setNotifiedAlertIds] = useState<string[]>([]);

  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!currentCompanyId) {
      setManualAlerts([]);
      return;
    }
    try {
      const raw = localStorage.getItem(`${MANUAL_ALERTS_STORAGE_PREFIX}:${currentCompanyId}`);
      if (!raw) {
        setManualAlerts([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setManualAlerts([]);
        return;
      }
      setManualAlerts(
        parsed.filter(Boolean).map((item: Partial<ManualNotification>) => ({
          id: String(item.id || `manual_${Math.random().toString(36).slice(2, 10)}`),
          title: String(item.title || ''),
          note: item.note ? String(item.note) : '',
          severity: item.severity === 'CRITICAL' || item.severity === 'INFO' ? item.severity : 'WARNING',
          dueDate: normalizeIso(item.dueDate),
          createdAt: normalizeIso(item.createdAt) || todayIso,
          done: Boolean(item.done),
        }))
      );
    } catch {
      setManualAlerts([]);
    }
  }, [currentCompanyId, todayIso]);

  useEffect(() => {
    if (!currentCompanyId) return;
    localStorage.setItem(`${MANUAL_ALERTS_STORAGE_PREFIX}:${currentCompanyId}`, JSON.stringify(manualAlerts));
  }, [manualAlerts, currentCompanyId]);

  useEffect(() => {
    if (!currentCompanyId) {
      setNotifiedAlertIds([]);
      return;
    }
    try {
      const raw = localStorage.getItem(`${NOTIFIED_ALERTS_STORAGE_PREFIX}:${currentCompanyId}`);
      if (!raw) {
        setNotifiedAlertIds([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setNotifiedAlertIds([]);
        return;
      }
      const sanitized = Array.from(
        new Set(
          parsed
            .map((id: unknown) => String(id || '').trim())
            .filter(Boolean)
        )
      ).slice(-500);
      setNotifiedAlertIds(sanitized);
    } catch {
      setNotifiedAlertIds([]);
    }
  }, [currentCompanyId]);

  useEffect(() => {
    if (!currentCompanyId) return;
    localStorage.setItem(
      `${NOTIFIED_ALERTS_STORAGE_PREFIX}:${currentCompanyId}`,
      JSON.stringify(notifiedAlertIds.slice(-500))
    );
  }, [currentCompanyId, notifiedAlertIds]);

  const contactNameMap = useMemo(
    () => new Map(contacts.map(c => [c.id, c.name])),
    [contacts]
  );
  const employeeNameMap = useMemo(
    () => new Map(employees.map(e => [e.id, e.name])),
    [employees]
  );

  const expiryAlertEnabled = companySettings.expiryAlertEnabled ?? true;
  const globalExpiryDays = Number.isFinite(Number(companySettings.expiryAlertDays))
    ? Math.max(0, Math.floor(Number(companySettings.expiryAlertDays)))
    : 30;
  const globalLowStockThreshold = Number.isFinite(Number(companySettings.lowStockAlertQtyDefault))
    ? Math.max(0, Math.floor(Number(companySettings.lowStockAlertQtyDefault)))
    : 5;
  const desktopNotificationsEnabled = companySettings.alertsDesktopNotificationsEnabled === true;
  const desktopNotifySystem = companySettings.alertsDesktopNotifySystem !== false;
  const desktopNotifyManual = companySettings.alertsDesktopNotifyManual !== false;
  const desktopNotifyChecks = companySettings.alertsDesktopNotifyChecks !== false;
  const desktopNotifyLowStock = companySettings.alertsDesktopNotifyLowStock !== false;
  const desktopNotifyExpiry = companySettings.alertsDesktopNotifyExpiry !== false;
  const desktopNotifyOverdueInvoices = companySettings.alertsDesktopNotifyOverdueInvoices !== false;
  const desktopNotifyContractExpiry = companySettings.alertsDesktopNotifyContractExpiry !== false;
  const alertSoundEnabled = companySettings.alertsSoundEnabled !== false;

  const systemAlerts = useMemo<FeedAlert[]>(() => {
    const items: FeedAlert[] = [];

    checks.forEach(check => {
      if (check.status !== 'PENDING' && check.status !== 'UNDER_COLLECTION') return;
      const due = normalizeIso(check.dueDate);
      if (!due) return;
      const d = diffDays(due, todayIso);
      if (d > CHECK_PRE_ALERT_DAYS) return;

      const contactName =
        (check.contactId && contactNameMap.get(check.contactId)) ||
        (check.originalContactId && contactNameMap.get(check.originalContactId)) ||
        '';

      const isDueNow = d <= 0;
      items.push({
        id: `check_${check.id}_${isDueNow ? 'due' : 'soon'}`,
        source: 'SYSTEM',
        kind: isDueNow ? 'CHECK_DUE_NOW' : 'CHECK_DUE_SOON',
        title: isDueNow
          ? tr('شيك مستحق/متأخر', 'Due/Overdue Check')
          : tr('شيك مستحق خلال 5 أيام', 'Check due within 5 days'),
        note: [
          `#${check.checkNumber}`,
          check.bankName,
          contactName || '',
          `${new Intl.NumberFormat(getNumberLocale(appLanguage), { maximumFractionDigits: 2 }).format(Number(check.amount) || 0)} ${check.currency || baseCurrency}`,
          d < 0
            ? tr(`متأخر ${Math.abs(d)} يوم`, `${Math.abs(d)} day(s) overdue`)
            : d === 0
              ? tr('مستحق اليوم', 'Due today')
              : tr(`بعد ${d} يوم`, `In ${d} day(s)`),
        ].filter(Boolean).join(' • '),
        severity: d < 0 ? 'CRITICAL' : d === 0 ? 'WARNING' : 'INFO',
        dueDate: due,
        createdAt: due,
        done: false,
        entityLabel: check.checkNumber,
      });
    });

    products.forEach(product => {
      if (!isStockProduct(product)) return;
      const stock = Number(product.stock) || 0;
      const threshold = Number.isFinite(Number(product.lowStockAlertQty))
        ? Math.max(0, Math.floor(Number(product.lowStockAlertQty)))
        : globalLowStockThreshold;
      if (stock <= threshold) {
        const reorderQty = Number.isFinite(Number(product.reorderQty))
          ? Math.max(0, Math.floor(Number(product.reorderQty)))
          : 0;
        items.push({
          id: `product_low_${product.id}`,
          source: 'SYSTEM',
          kind: reorderQty > 0 ? 'ORDER_NOW' : 'LOW_STOCK',
          title: reorderQty > 0 ? tr('اطلب الآن - نقص مخزون', 'Order now - low stock') : tr('نقص مخزون صنف', 'Low stock item'),
          note: tr(
            `${product.name} • الرصيد ${stock} • الحد ${threshold}${reorderQty > 0 ? ` • إعادة الطلب ${reorderQty}` : ''}`,
            `${product.name} • Stock ${stock} • Threshold ${threshold}${reorderQty > 0 ? ` • Reorder ${reorderQty}` : ''}`
          ),
          severity: stock <= 0 ? 'CRITICAL' : 'WARNING',
          createdAt: todayIso,
          done: false,
          entityLabel: product.name,
        });
      }

      if (expiryAlertEnabled) {
        const expiryDate = normalizeIso(product.expiryDate);
        if (!expiryDate || stock <= 0) return;
        const days = diffDays(expiryDate, todayIso);
        const thresholdDays = Number.isFinite(Number(product.expiryAlertLeadDays))
          ? Math.max(0, Math.floor(Number(product.expiryAlertLeadDays)))
          : globalExpiryDays;
        if (days <= thresholdDays) {
          items.push({
            id: `product_expiry_${product.id}`,
            source: 'SYSTEM',
            kind: 'EXPIRY',
            title: days < 0 ? tr('صنف منتهي الصلاحية', 'Expired item') : tr('صنف قريب الانتهاء', 'Item near expiry'),
            note: tr(
              `${product.name} • ينتهي ${expiryDate}${days < 0 ? ` • متأخر ${Math.abs(days)} يوم` : ` • خلال ${days} يوم`}`,
              `${product.name} • Expires ${expiryDate}${days < 0 ? ` • ${Math.abs(days)} day(s) overdue` : ` • in ${days} day(s)`}`
            ),
            severity: days < 0 ? 'CRITICAL' : 'WARNING',
            dueDate: expiryDate,
            createdAt: expiryDate,
            done: false,
            entityLabel: product.name,
          });
        }
      }
    });

    invoices.forEach(invoice => {
      if (invoice.status === 'CANCELLED' || invoice.status === 'QUOTATION') return;
      if (invoice.type !== TransactionType.INCOME && invoice.type !== TransactionType.EXPENSE) return;
      if (invoice.paymentType !== 'CREDIT') return;
      if (invoice.category === 'sales_return' || invoice.category === 'purchase_return') return;
      const due = normalizeIso(invoice.dueDate || invoice.date);
      if (!due || due >= todayIso) return;
      const remaining = getInvoiceRemainingBase(invoice, invoiceSettlements);
      if (remaining <= 0.005) return;
      const daysLate = Math.abs(diffDays(due, todayIso));
      items.push({
        id: `invoice_overdue_${invoice.id}`,
        source: 'SYSTEM',
        kind: 'OVERDUE_INVOICE',
        title: invoice.type === TransactionType.INCOME
          ? tr('فاتورة مبيعات متأخرة', 'Overdue sales invoice')
          : tr('فاتورة مشتريات متأخرة', 'Overdue purchase invoice'),
        note: tr(
          `${invoice.invoiceNumber} • متبقي ${remaining.toFixed(2)} ${invoice.currency || baseCurrency} • متأخرة ${daysLate} يوم`,
          `${invoice.invoiceNumber} • Remaining ${remaining.toFixed(2)} ${invoice.currency || baseCurrency} • ${daysLate} day(s) overdue`
        ),
        severity: daysLate > 30 ? 'CRITICAL' : 'WARNING',
        dueDate: due,
        createdAt: due,
        done: false,
        entityLabel: invoice.invoiceNumber,
      });
    });

    employeeContracts.forEach(contract => {
      if (contract.status !== 'ACTIVE') return;
      const endDate = normalizeIso(contract.endDate);
      if (!endDate) return;
      const d = diffDays(endDate, todayIso);
      if (d < 0 || d > 30) return;
      items.push({
        id: `contract_expiry_${contract.id}`,
        source: 'SYSTEM',
        kind: 'CONTRACT_EXPIRY',
        title: tr('عقد موظف ينتهي قريبًا', 'Employee contract ending soon'),
        note: tr(
          `${employeeNameMap.get(contract.employeeId) || tr('موظف', 'Employee')} • ${endDate} • ${d === 0 ? 'اليوم' : `خلال ${d} يوم`}`,
          `${employeeNameMap.get(contract.employeeId) || 'Employee'} • ${endDate} • ${d === 0 ? 'today' : `in ${d} day(s)`}`
        ),
        severity: d <= 7 ? 'WARNING' : 'INFO',
        dueDate: endDate,
        createdAt: endDate,
        done: false,
        entityLabel: employeeNameMap.get(contract.employeeId),
      });
    });

    return items;
  }, [
    appLanguage,
    baseCurrency,
    checks,
    contacts,
    contactNameMap,
    products,
    invoices,
    invoiceSettlements,
    employeeContracts,
    employeeNameMap,
    todayIso,
    globalLowStockThreshold,
    expiryAlertEnabled,
    globalExpiryDays,
  ]);

  const manualFeed = useMemo<FeedAlert[]>(
    () =>
      manualAlerts.map(item => ({
        id: item.id,
        source: 'MANUAL',
        kind: 'MANUAL',
        title: item.title,
        note: item.note,
        severity: item.severity,
        dueDate: normalizeIso(item.dueDate),
        createdAt: normalizeIso(item.createdAt) || todayIso,
        done: Boolean(item.done),
      })),
    [manualAlerts, todayIso]
  );

  const allAlerts = useMemo(() => {
    return [...systemAlerts, ...manualFeed].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const severityDelta = severityRank[b.severity] - severityRank[a.severity];
      if (severityDelta !== 0) return severityDelta;
      const dueA = a.dueDate || a.createdAt;
      const dueB = b.dueDate || b.createdAt;
      return String(dueA).localeCompare(String(dueB));
    });
  }, [systemAlerts, manualFeed]);

  const shouldNotifyByKind = (kind: AlertKind): boolean => {
    switch (kind) {
      case 'CHECK_DUE_SOON':
      case 'CHECK_DUE_NOW':
        return desktopNotifyChecks;
      case 'LOW_STOCK':
      case 'ORDER_NOW':
        return desktopNotifyLowStock;
      case 'EXPIRY':
        return desktopNotifyExpiry;
      case 'OVERDUE_INVOICE':
        return desktopNotifyOverdueInvoices;
      case 'CONTRACT_EXPIRY':
        return desktopNotifyContractExpiry;
      case 'MANUAL':
      default:
        return true;
    }
  };

  const playAlertTone = useCallback(() => {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    void ctx.resume().catch(() => undefined);

    const beep = (frequency: number, startAt: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.05, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration);
    };

    beep(880, now, 0.14);
    beep(660, now + 0.16, 0.18);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 800);
  }, []);

  useEffect(() => {
    if (!currentCompanyId) return;
    if (!desktopNotificationsEnabled && !alertSoundEnabled) return;

    const known = new Set(notifiedAlertIds);
    const candidates = allAlerts.filter(item => {
      if (item.done) return false;
      if (known.has(item.id)) return false;
      if (item.source === 'SYSTEM' && !desktopNotifySystem) return false;
      if (item.source === 'MANUAL' && !desktopNotifyManual) return false;
      if (!shouldNotifyByKind(item.kind)) return false;
      return true;
    });

    if (candidates.length === 0) return;

    const desktopCanNotify =
      desktopNotificationsEnabled &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'granted';
    const processingItems = desktopCanNotify ? candidates.slice(0, 5) : candidates;

    const notifiedNow: string[] = [];
    if (desktopCanNotify) processingItems.forEach(item => {
      try {
        new window.Notification(item.title, {
          body: item.note || item.entityLabel || tr('تنبيه جديد', 'New alert'),
          tag: `smart-acc-alert:${currentCompanyId}:${item.id}`,
          lang: appLanguage === 'AR' ? 'ar' : 'en',
          dir: appLanguage === 'AR' ? 'rtl' : 'ltr'
        });
      } catch {
        // Ignore browser notification errors.
      }
      notifiedNow.push(item.id);
    });

    if (alertSoundEnabled && processingItems.length > 0) {
      playAlertTone();
      if (!desktopCanNotify) {
        notifiedNow.push(...processingItems.map(item => item.id));
      }
    }

    if (notifiedNow.length === 0) return;
    setNotifiedAlertIds(prev => Array.from(new Set([...prev, ...notifiedNow])).slice(-500));
  }, [
    allAlerts,
    appLanguage,
    alertSoundEnabled,
    currentCompanyId,
    desktopNotificationsEnabled,
    desktopNotifyManual,
    desktopNotifyChecks,
    desktopNotifyLowStock,
    desktopNotifyExpiry,
    desktopNotifyOverdueInvoices,
    desktopNotifyContractExpiry,
    desktopNotifySystem,
    notifiedAlertIds,
    playAlertTone,
    tr
  ]);

  const filteredAlerts = useMemo(() => {
    return allAlerts.filter(item => {
      if (sourceFilter !== 'ALL' && item.source !== sourceFilter) return false;
      if (severityFilter !== 'ALL' && item.severity !== severityFilter) return false;
      if (statusFilter === 'OPEN' && item.done) return false;
      if (statusFilter === 'DONE' && !item.done) return false;
      return true;
    });
  }, [allAlerts, sourceFilter, severityFilter, statusFilter]);

  const summary = useMemo(() => {
    const checksSoon = systemAlerts.filter(a => a.kind === 'CHECK_DUE_SOON').length;
    const checksDueNow = systemAlerts.filter(a => a.kind === 'CHECK_DUE_NOW').length;
    const lowStock = systemAlerts.filter(a => a.kind === 'LOW_STOCK' || a.kind === 'ORDER_NOW').length;
    const manualOpen = manualAlerts.filter(a => !a.done).length;
    return { checksSoon, checksDueNow, lowStock, manualOpen, totalOpen: allAlerts.filter(a => !a.done).length };
  }, [systemAlerts, manualAlerts, allAlerts]);

  const addManualAlert = () => {
    const title = manualTitle.trim();
    if (!title) {
      alert(tr('يرجى إدخال عنوان التنبيه.', 'Please enter alert title.'));
      return;
    }
    const next: ManualNotification = {
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      note: manualNote.trim(),
      severity: manualSeverity,
      dueDate: normalizeIso(manualDueDate),
      createdAt: todayIso,
      done: false,
    };
    setManualAlerts(prev => [next, ...prev]);
    setManualTitle('');
    setManualNote('');
    setManualDueDate('');
    setManualSeverity('WARNING');
  };

  const toggleManualDone = (id: string) => {
    setManualAlerts(prev => prev.map(item => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  const deleteManualAlert = (id: string) => {
    setManualAlerts(prev => prev.filter(item => item.id !== id));
  };

  const severityChipClass = (severity: AlertSeverity) => {
    if (severity === 'CRITICAL') return 'bg-rose-100 text-rose-700';
    if (severity === 'WARNING') return 'bg-amber-100 text-amber-700';
    return 'bg-blue-100 text-blue-700';
  };

  const severityLabel = (severity: AlertSeverity) => {
    if (severity === 'CRITICAL') return tr('حرج', 'Critical');
    if (severity === 'WARNING') return tr('تحذير', 'Warning');
    return tr('معلومة', 'Info');
  };

  const formatDate = (iso?: string) => {
    const normalized = normalizeIso(iso);
    if (!normalized) return '-';
    return new Intl.DateTimeFormat(getDateLocale(appLanguage), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(normalized));
  };

  return (
    <div className="bg-gray-50 min-h-dvh app-page text-slate-800 font-tajawal">
      <div className="bg-white px-3 pt-3 pb-2 border-b border-gray-100 sticky top-0 z-40">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-black text-slate-800">{tr('التنبيهات', 'Alerts')}</h1>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              {tr('تنبيهات النظام + تنبيهات يدوية خاصة بك', 'System alerts + your custom alerts')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <BellRing className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm">
            <div className="text-[10px] font-black text-slate-400">{tr('شيكات خلال 5 أيام', 'Checks in 5 days')}</div>
            <div className="mt-1.5 text-lg font-black text-blue-600 dir-ltr">{summary.checksSoon}</div>
          </div>
          <div className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm">
            <div className="text-[10px] font-black text-slate-400">{tr('شيكات مستحقة/متأخرة', 'Due/Overdue Checks')}</div>
            <div className="mt-1.5 text-lg font-black text-rose-600 dir-ltr">{summary.checksDueNow}</div>
          </div>
          <div className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm">
            <div className="text-[10px] font-black text-slate-400">{tr('نقص المخزون', 'Low Stock')}</div>
            <div className="mt-1.5 text-lg font-black text-orange-600 dir-ltr">{summary.lowStock}</div>
          </div>
          <div className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm">
            <div className="text-[10px] font-black text-slate-400">{tr('تنبيهات يدوية مفتوحة', 'Open Manual Alerts')}</div>
            <div className="mt-1.5 text-lg font-black text-emerald-600 dir-ltr">{summary.manualOpen}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-black text-slate-700">{tr('إضافة تنبيه يدوي', 'Add manual alert')}</h2>
            <span className="hidden sm:block text-[10px] text-slate-400 font-black">{tr('يُحفظ لكل شركة', 'Saved per company')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder={tr('عنوان التنبيه', 'Alert title')}
              className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100"
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <EnglishDateInput
                value={manualDueDate}
                onChange={setManualDueDate}
                placeholder={tr('تاريخ الاستحقاق (اختياري)', 'Due date (optional)')}
                className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-bold"
                wrapperClassName="w-full"
              />
              <select
                value={manualSeverity}
                onChange={(e) => setManualSeverity(e.target.value as AlertSeverity)}
                className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-black outline-none"
              >
                <option value="INFO">{tr('معلومة', 'Info')}</option>
                <option value="WARNING">{tr('تحذير', 'Warning')}</option>
                <option value="CRITICAL">{tr('حرج', 'Critical')}</option>
              </select>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <input
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              placeholder={tr('ملاحظة / وصف (اختياري)', 'Note / description (optional)')}
              className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="button"
              onClick={addManualAlert}
              className="h-10 rounded-xl bg-blue-600 text-white px-4 text-xs font-black flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {tr('إضافة', 'Add')}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm space-y-2">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h2 className="text-sm font-black text-slate-700">{tr('قائمة التنبيهات', 'Alerts list')}</h2>
            <div className="text-[10px] font-black text-gray-500">
              {tr('المفتوحة', 'Open')}: {summary.totalOpen} • {tr('الكل', 'All')}: {allAlerts.length}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as 'ALL' | AlertSource)}
              className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-black outline-none"
            >
              <option value="ALL">{tr('كل المصادر', 'All sources')}</option>
              <option value="SYSTEM">{tr('تنبيهات النظام', 'System alerts')}</option>
              <option value="MANUAL">{tr('تنبيهات يدوية', 'Manual alerts')}</option>
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as 'ALL' | AlertSeverity)}
              className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-black outline-none"
            >
              <option value="ALL">{tr('كل الدرجات', 'All severities')}</option>
              <option value="CRITICAL">{tr('حرج', 'Critical')}</option>
              <option value="WARNING">{tr('تحذير', 'Warning')}</option>
              <option value="INFO">{tr('معلومة', 'Info')}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'OPEN' | 'DONE')}
              className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-black outline-none"
            >
              <option value="ALL">{tr('كل الحالات', 'All statuses')}</option>
              <option value="OPEN">{tr('مفتوحة', 'Open')}</option>
              <option value="DONE">{tr('مكتملة', 'Done')}</option>
            </select>
          </div>

          <div className="space-y-3">
            {filteredAlerts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-black text-slate-400">
                {tr('لا توجد تنبيهات مطابقة للفلاتر الحالية.', 'No alerts match current filters.')}
              </div>
            ) : (
              filteredAlerts.map(item => (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    item.done ? 'bg-gray-50 border-gray-200 opacity-80' : 'bg-white border-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center ${
                        item.kind === 'CHECK_DUE_SOON' || item.kind === 'CHECK_DUE_NOW' ? 'bg-amber-50 text-amber-600'
                          : item.kind === 'LOW_STOCK' || item.kind === 'ORDER_NOW' ? 'bg-orange-50 text-orange-600'
                          : item.kind === 'EXPIRY' ? 'bg-rose-50 text-rose-600'
                          : item.kind === 'OVERDUE_INVOICE' ? 'bg-indigo-50 text-indigo-600'
                          : item.kind === 'CONTRACT_EXPIRY' ? 'bg-cyan-50 text-cyan-600'
                          : 'bg-blue-50 text-blue-600'
                      }`}>
                        {item.kind === 'CHECK_DUE_SOON' || item.kind === 'CHECK_DUE_NOW' ? <Clock4 className="w-5 h-5" />
                          : item.kind === 'LOW_STOCK' ? <Package className="w-5 h-5" />
                          : item.kind === 'ORDER_NOW' ? <ShoppingCart className="w-5 h-5" />
                          : item.kind === 'EXPIRY' ? <AlertTriangle className="w-5 h-5" />
                          : item.kind === 'OVERDUE_INVOICE' ? <FileClock className="w-5 h-5" />
                          : item.kind === 'CONTRACT_EXPIRY' ? <CalendarRange className="w-5 h-5" />
                          : <ShieldAlert className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className={`text-sm font-black truncate ${item.done ? 'text-gray-500 line-through' : 'text-slate-800'}`}>
                            {item.title}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${severityChipClass(item.severity)}`}>
                            {severityLabel(item.severity)}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">
                            {item.source === 'SYSTEM' ? tr('نظام', 'System') : tr('يدوي', 'Manual')}
                          </span>
                        </div>
                        {item.note && (
                          <p className={`mt-1 text-xs font-bold ${item.done ? 'text-gray-400' : 'text-slate-500'}`}>
                            {item.note}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-black text-slate-400">
                          <span>{tr('الإنشاء', 'Created')}: {formatDate(item.createdAt)}</span>
                          {item.dueDate && <span>{tr('الاستحقاق', 'Due')}: {formatDate(item.dueDate)}</span>}
                        </div>
                      </div>
                    </div>

                    {item.source === 'MANUAL' && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleManualDone(item.id)}
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                            item.done ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-gray-200 bg-white text-gray-500'
                          }`}
                          title={item.done ? tr('إعادة فتح', 'Re-open') : tr('تم التنفيذ', 'Mark done')}
                        >
                          {item.done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteManualAlert(item.id)}
                          className="w-9 h-9 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 flex items-center justify-center"
                          title={tr('حذف', 'Delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationCenterManager;
