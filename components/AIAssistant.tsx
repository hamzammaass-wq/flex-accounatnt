import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useAccounting } from '../contexts/AccountingContext';
import { AlertCircle, BarChart3, Bot, Brain, CheckCircle2, FileText, Globe, Loader2, Mic, PlayCircle, Receipt, Scale, Send, Sparkles, Wallet } from 'lucide-react';
import { TransactionType, type Invoice } from '../types';
import useResponsiveMode from '../hooks/useResponsiveMode';
import { isStockProduct } from '../utils/productKind';

type AssistantMessage = {
  role: 'user' | 'model';
  text: string;
  type?: 'thought' | 'search' | 'error';
};

interface AIAssistantProps {
  onOpenVoiceAssistant?: () => void;
}

type AnalyticsTabId = 'expenses' | 'revenue' | 'profit';

type RankedMetric = {
  label: string;
  value: number;
  note?: string;
  displayValue?: string;
};

type SmartIssue = {
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
};

type SuggestedEntry = {
  title: string;
  debit: string;
  credit: string;
  amount: number;
  note?: string;
};

type MonthlyInsight = {
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
};

type ResultCardMetric = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
};

const toDateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateInput = (value: string): Date => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const isDateWithinRange = (value: string | undefined, start: string, end: string): boolean => {
  const datePart = String(value || '').slice(0, 10);
  return Boolean(datePart && datePart >= start && datePart <= end);
};

const normalizeBaseAmount = (amount: number, exchangeRate?: number): number => (
  Number(amount || 0) * (Number(exchangeRate) || 1)
);

const extractGeminiApiKey = (): string => {
  const env = (import.meta as any)?.env ?? {};
  const processEnv = (globalThis as any)?.process?.env ?? {};
  const candidates = [
    env.VITE_GEMINI_API_KEY,
    env.GEMINI_API_KEY,
    env.VITE_API_KEY,
    env.API_KEY,
    processEnv.VITE_GEMINI_API_KEY,
    processEnv.GEMINI_API_KEY,
    processEnv.VITE_API_KEY,
    processEnv.API_KEY
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim();
    if (!normalized) continue;
    if (/^placeholder/i.test(normalized)) continue;
    return normalized;
  }
  return '';
};

const AIAssistant: React.FC<AIAssistantProps> = ({ onOpenVoiceAssistant }) => {
  const { transactions, summary, checks, products, baseCurrency, companySettings, invoices, contacts, accounts } = useAccounting();
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const assistantLanguage = isEnglish ? 'English' : 'Arabic';
  const apiKey = useMemo(() => extractGeminiApiKey(), []);
  const cloudAiEnabled = apiKey.length > 0;
  const assistantDisplayName = tr('المحاسب فلكس', 'accountant flex');
  const assistantWelcomeTitle = tr('مرحبًا بك في المحاسب فلكس 👋', 'Welcome to accountant flex');
  const assistantWelcomeText = tr(
    'دعنا نساعدك في تحليل بياناتك المالية وتبسيط أعمالك المحاسبية.',
    'Let us help you analyze your financial data and simplify your accounting work.'
  );
  const assistantLoadingTitle = tr('جاري تحليل البيانات...', 'Analyzing data...');
  const assistantLoadingText = tr(
    'يرجى الانتظار، نقوم باستخراج أفضل التوصيات لك.',
    'Please wait while we extract the best recommendations for you.'
  );
  const assistantSuccessTitle = tr('تم التحليل بنجاح ✅', 'Analysis completed successfully');
  const assistantSuccessText = tr(
    'هذه أهم التوصيات لتحسين وضعك المالي.',
    'These are the top recommendations to improve your financial position.'
  );
  const assistantEmptyTitle = tr('لا توجد بيانات كافية حاليًا', 'There is not enough data yet');
  const assistantEmptyText = tr(
    'قم بإضافة عملياتك المالية لنبدأ التحليل الذكي.',
    'Add your financial operations so we can start smart analysis.'
  );
  const assistantInsideDescription = tr(
    'مساعد ذكي متكامل يساعدك على إدارة عملياتك المحاسبية بكفاءة عالية، من خلال تحليل البيانات المالية، اقتراح القيود، ومتابعة الأداء المالي بشكل لحظي، مما يوفر الوقت ويقلل الأخطاء البشرية.',
    'An integrated smart assistant that helps you manage accounting operations efficiently by analyzing financial data, suggesting journal entries, and tracking financial performance in real time to save time and reduce manual errors.'
  );
  const assistantMarketingTitle = tr(
    'المحاسب فلكس - دع الذكاء يدير أرقامك',
    'accountant flex - Let intelligence run your numbers'
  );
  const assistantMarketingDescription = tr(
    'ارتقِ بإدارة حساباتك إلى مستوى جديد مع المحاسب فلكس. حل متطور يعتمد على الذكاء الاصطناعي لتحليل بياناتك المالية، أتمتة القيود اليومية، وتقديم توصيات ذكية تساعدك على اتخاذ قرارات مالية دقيقة بثقة وسرعة.',
    'Take your accounting to a new level with accountant flex. It uses AI to analyze your financial data, automate daily entries, and deliver smart recommendations that support faster and more confident financial decisions.'
  );
  const formatAmount = (value: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0));
  const formatQty = (value: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
  const todayInput = useMemo(() => toDateInputValue(new Date()), []);
  const currentMonthStart = useMemo(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: 'model',
      text: `${assistantWelcomeTitle}\n${assistantWelcomeText}`
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [useThinking, setUseThinking] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [analysisTab, setAnalysisTab] = useState<AnalyticsTabId>('expenses');
  const [rangeStart, setRangeStart] = useState(currentMonthStart);
  const [rangeEnd, setRangeEnd] = useState(todayInput);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isTablet } = useResponsiveMode();
  const accountsById = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);
  const contactsById = useMemo(() => new Map(contacts.map(contact => [contact.id, contact])), [contacts]);
  const productsById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const pendingIncomingChecks = useMemo(
    () => checks.filter(c => c.status === 'PENDING' && c.type === 'INCOMING'),
    [checks]
  );
  const pendingOutgoingChecks = useMemo(
    () => checks.filter(c => c.status === 'PENDING' && c.type === 'OUTGOING'),
    [checks]
  );
  const lowStockItems = useMemo(
    () => products.filter(p => isStockProduct(p) && p.stock < 5).sort((a, b) => a.stock - b.stock).slice(0, 5),
    [products]
  );
  const effectiveRange = useMemo(() => (
    rangeStart <= rangeEnd
      ? { start: rangeStart, end: rangeEnd }
      : { start: rangeEnd, end: rangeStart }
  ), [rangeStart, rangeEnd]);
  const hasAnalysisData = useMemo(() => {
    const hasTransactions = transactions.length > 0;
    const hasChecks = checks.length > 0;
    const hasProducts = products.length > 0;
    const hasInvoices = invoices.length > 0;
    const hasSummaryValues = [summary.netBalance, summary.totalIncome, summary.totalExpense]
      .some(value => Math.abs(Number(value) || 0) > 0.0001);
    return hasTransactions || hasChecks || hasProducts || hasInvoices || hasSummaryValues;
  }, [transactions.length, checks.length, products.length, invoices.length, summary.netBalance, summary.totalIncome, summary.totalExpense]);
  const successfulAnalysesCount = useMemo(
    () => messages.filter((msg, idx) => idx > 0 && msg.role === 'model' && msg.type !== 'error').length,
    [messages]
  );
  const getAccountLabel = (accountId?: string, fallback?: string): string => (
    accountId
      ? (accountsById.get(accountId)?.name || fallback || accountId)
      : (fallback || tr('غير مصنف', 'Unclassified'))
  );
  const getContactLabel = (contactId?: string, fallback?: string): string => (
    contactId
      ? (contactsById.get(contactId)?.name || fallback || tr('عميل غير محدد', 'Unknown customer'))
      : (fallback || tr('عميل نقدي / غير محدد', 'Cash / unknown customer'))
  );
  const postedInvoices = useMemo(
    () => invoices.filter(inv => (inv.postingStatus || 'POSTED') === 'POSTED' && inv.status !== 'QUOTATION' && !inv.isReversal),
    [invoices]
  );
  const postedTransactions = useMemo(
    () => transactions.filter(tx => (tx.status || 'POSTED') === 'POSTED' && !tx.isReversal),
    [transactions]
  );
  const revenueInvoicesAll = useMemo(
    () => postedInvoices.filter(inv => inv.type === TransactionType.INCOME && inv.category !== 'sales_return' && inv.category !== 'customer_credit_note'),
    [postedInvoices]
  );
  const salesReturnInvoicesAll = useMemo(
    () => postedInvoices.filter(inv => inv.category === 'sales_return' || inv.category === 'customer_credit_note'),
    [postedInvoices]
  );
  const expenseTransactionsAll = useMemo(
    () => postedTransactions.filter(tx => {
      const debitAccount = tx.debitAccountId ? accountsById.get(tx.debitAccountId) : null;
      return tx.type === TransactionType.EXPENSE
        || debitAccount?.type === 'EXPENSE'
        || tx.category === 'expense'
        || tx.category === 'import_expenses';
    }),
    [postedTransactions, accountsById]
  );
  const rangePostedInvoices = useMemo(
    () => postedInvoices.filter(inv => isDateWithinRange(inv.date, effectiveRange.start, effectiveRange.end)),
    [postedInvoices, effectiveRange]
  );
  const rangeRevenueInvoices = useMemo(
    () => revenueInvoicesAll.filter(inv => isDateWithinRange(inv.date, effectiveRange.start, effectiveRange.end)),
    [revenueInvoicesAll, effectiveRange]
  );
  const rangeSalesReturnInvoices = useMemo(
    () => salesReturnInvoicesAll.filter(inv => isDateWithinRange(inv.date, effectiveRange.start, effectiveRange.end)),
    [salesReturnInvoicesAll, effectiveRange]
  );
  const rangeExpenseTransactions = useMemo(
    () => expenseTransactionsAll.filter(tx => isDateWithinRange(tx.date, effectiveRange.start, effectiveRange.end)),
    [expenseTransactionsAll, effectiveRange]
  );
  const sumRevenueForRange = (start: string, end: string): number => (
    revenueInvoicesAll
      .filter(inv => isDateWithinRange(inv.date, start, end))
      .reduce((sum, inv) => sum + normalizeBaseAmount(inv.totalAmount, inv.exchangeRate), 0)
    - salesReturnInvoicesAll
      .filter(inv => isDateWithinRange(inv.date, start, end))
      .reduce((sum, inv) => sum + normalizeBaseAmount(inv.totalAmount, inv.exchangeRate), 0)
  );
  const sumExpensesForRange = (start: string, end: string): number => (
    expenseTransactionsAll
      .filter(tx => isDateWithinRange(tx.date, start, end))
      .reduce((sum, tx) => sum + normalizeBaseAmount(tx.amount, tx.exchangeRate), 0)
  );
  const periodRevenue = useMemo(
    () => sumRevenueForRange(effectiveRange.start, effectiveRange.end),
    [effectiveRange, revenueInvoicesAll, salesReturnInvoicesAll]
  );
  const periodExpenses = useMemo(
    () => sumExpensesForRange(effectiveRange.start, effectiveRange.end),
    [effectiveRange, expenseTransactionsAll]
  );
  const periodProfit = useMemo(() => periodRevenue - periodExpenses, [periodRevenue, periodExpenses]);
  const periodMargin = useMemo(() => (periodRevenue > 0 ? (periodProfit / periodRevenue) * 100 : 0), [periodRevenue, periodProfit]);
  const previousRange = useMemo(() => {
    const startDate = parseDateInput(effectiveRange.start);
    const endDate = parseDateInput(effectiveRange.end);
    const spanDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
    const previousEnd = addDays(startDate, -1);
    const previousStart = addDays(previousEnd, -(spanDays - 1));
    return { start: toDateInputValue(previousStart), end: toDateInputValue(previousEnd) };
  }, [effectiveRange]);
  const previousRevenue = useMemo(
    () => sumRevenueForRange(previousRange.start, previousRange.end),
    [previousRange, revenueInvoicesAll, salesReturnInvoicesAll]
  );
  const previousExpenses = useMemo(
    () => sumExpensesForRange(previousRange.start, previousRange.end),
    [previousRange, expenseTransactionsAll]
  );
  const expenseGrowth = useMemo(
    () => (previousExpenses > 0 ? ((periodExpenses - previousExpenses) / previousExpenses) * 100 : 0),
    [periodExpenses, previousExpenses]
  );
  const revenueGrowth = useMemo(
    () => (previousRevenue > 0 ? ((periodRevenue - previousRevenue) / previousRevenue) * 100 : 0),
    [periodRevenue, previousRevenue]
  );
  const topExpenseRows = useMemo<RankedMetric[]>(() => {
    const grouped = new Map<string, RankedMetric>();
    rangeExpenseTransactions.forEach(tx => {
      const key = tx.debitAccountId || tx.category || tx.description || 'uncategorized';
      const current = grouped.get(key) || {
        label: getAccountLabel(tx.debitAccountId, tx.category || tr('مصروف متنوع', 'Misc expense')),
        value: 0,
        note: tx.category || tr('مستخرج من الحركات المرحلة', 'Derived from posted transactions')
      };
      current.value += normalizeBaseAmount(tx.amount, tx.exchangeRate);
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [rangeExpenseTransactions, accountsById]);
  const topRevenueCustomers = useMemo<RankedMetric[]>(() => {
    const grouped = new Map<string, RankedMetric>();
    rangeRevenueInvoices.forEach(inv => {
      const key = inv.customerId || 'cash_customer';
      const current = grouped.get(key) || {
        label: getContactLabel(inv.customerId),
        value: 0,
        note: tr('إيراد من الفواتير المرحلة', 'Revenue from posted invoices')
      };
      current.value += normalizeBaseAmount(inv.totalAmount, inv.exchangeRate);
      grouped.set(key, current);
    });
    rangeSalesReturnInvoices.forEach(inv => {
      const key = inv.customerId || 'cash_customer';
      const current = grouped.get(key) || {
        label: getContactLabel(inv.customerId),
        value: 0,
        note: tr('بعد خصم المرتجعات', 'After sales returns')
      };
      current.value -= normalizeBaseAmount(inv.totalAmount, inv.exchangeRate);
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [rangeRevenueInvoices, rangeSalesReturnInvoices, contactsById]);
  const customerProfitability = useMemo<RankedMetric[]>(() => {
    const grouped = new Map<string, RankedMetric>();
    const applyInvoiceProfit = (invoice: Invoice, direction: 1 | -1) => {
      const key = invoice.customerId || 'cash_customer';
      const revenue = normalizeBaseAmount(invoice.totalAmount, invoice.exchangeRate) * direction;
      const estimatedCost = invoice.items.reduce((sum, item) => {
        const productCost = item.productId ? Number(productsById.get(item.productId)?.buyPrice || 0) : 0;
        return sum + (Number(item.quantity || 0) * productCost * direction);
      }, 0);
      const current = grouped.get(key) || {
        label: getContactLabel(invoice.customerId),
        value: 0,
        note: tr('ربحية تقديرية حسب أسعار الشراء الحالية', 'Estimated profitability based on current buy prices')
      };
      current.value += revenue - estimatedCost;
      grouped.set(key, current);
    };

    rangeRevenueInvoices.forEach(inv => applyInvoiceProfit(inv, 1));
    rangeSalesReturnInvoices.forEach(inv => applyInvoiceProfit(inv, -1));

    return Array.from(grouped.values()).sort((a, b) => b.value - a.value);
  }, [rangeRevenueInvoices, rangeSalesReturnInvoices, productsById, contactsById]);
  const mostProfitableCustomer = customerProfitability[0] || null;
  const monthlyInsights = useMemo<MonthlyInsight[]>(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const start = toDateInputValue(monthDate);
      const end = toDateInputValue(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
      const revenue = sumRevenueForRange(start, end);
      const expenses = sumExpensesForRange(start, end);
      return {
        label: monthDate.toLocaleDateString(isEnglish ? 'en-US' : 'ar-EG', { month: 'short' }),
        revenue,
        expenses,
        profit: revenue - expenses
      };
    });
  }, [isEnglish, revenueInvoicesAll, salesReturnInvoicesAll, expenseTransactionsAll]);
  const forecastNextMonthProfit = useMemo(() => {
    const recent = monthlyInsights.slice(-3);
    if (!recent.length) return 0;
    const avgRevenue = recent.reduce((sum, item) => sum + item.revenue, 0) / recent.length;
    const avgExpenses = recent.reduce((sum, item) => sum + item.expenses, 0) / recent.length;
    const firstRevenue = recent[0]?.revenue || 0;
    const lastRevenue = recent[recent.length - 1]?.revenue || 0;
    const growthRate = firstRevenue > 0 ? (lastRevenue - firstRevenue) / firstRevenue : 0;
    const forecastRevenue = avgRevenue * (1 + (growthRate / 3));
    return forecastRevenue - avgExpenses;
  }, [monthlyInsights]);
  const smartIssues = useMemo<SmartIssue[]>(() => {
    const issues: SmartIssue[] = [];
    const duplicateNumbers = new Map<string, number>();
    const duplicateFingerprint = new Map<string, number>();

    rangePostedInvoices.forEach(inv => {
      const invoiceNumber = String(inv.invoiceNumber || '').trim();
      if (invoiceNumber) {
        duplicateNumbers.set(invoiceNumber, (duplicateNumbers.get(invoiceNumber) || 0) + 1);
      }
      const signature = [
        inv.customerId || 'na',
        String(inv.date || '').slice(0, 10),
        Number(inv.totalAmount || 0).toFixed(2),
        inv.type,
        inv.category || ''
      ].join('|');
      duplicateFingerprint.set(signature, (duplicateFingerprint.get(signature) || 0) + 1);
    });

    const duplicateNumberCount = Array.from(duplicateNumbers.values()).filter(count => count > 1).length;
    if (duplicateNumberCount > 0) {
      issues.push({
        severity: 'warning',
        title: tr('فواتير مكررة بالرقم', 'Duplicate invoice numbers'),
        description: tr(
          `تم العثور على ${duplicateNumberCount} رقم فاتورة مكرر داخل الفترة المحددة.`,
          `Found ${duplicateNumberCount} duplicate invoice number(s) in the selected period.`
        )
      });
    }

    const duplicatePatternCount = Array.from(duplicateFingerprint.values()).filter(count => count > 1).length;
    if (duplicatePatternCount > 0) {
      issues.push({
        severity: 'warning',
        title: tr('حركات متشابهة تحتاج مراجعة', 'Similar transactions need review'),
        description: tr(
          `يوجد ${duplicatePatternCount} نمط فاتورة متكرر بنفس التاريخ والمبلغ.`,
          `There are ${duplicatePatternCount} repeated invoice patterns with the same date and amount.`
        )
      });
    }

    const journalIssuesCount = postedTransactions.filter(tx => (
      isDateWithinRange(tx.date, effectiveRange.start, effectiveRange.end)
      && (tx.category === 'journal' || tx.debitAccountId || tx.creditAccountId)
      && (!tx.debitAccountId || !tx.creditAccountId || tx.debitAccountId === tx.creditAccountId || Number(tx.amount) <= 0)
    )).length;
    if (journalIssuesCount > 0) {
      issues.push({
        severity: 'error',
        title: tr('قيود تحتاج تصحيحًا', 'Journal entries need correction'),
        description: tr(
          `تم رصد ${journalIssuesCount} حركة يومية بحسابات ناقصة أو مبلغ غير صالح.`,
          `Detected ${journalIssuesCount} journal movement(s) with missing accounts or invalid amounts.`
        )
      });
    }

    const invoiceAverage = rangePostedInvoices.length
      ? rangePostedInvoices.reduce((sum, inv) => sum + normalizeBaseAmount(inv.totalAmount, inv.exchangeRate), 0) / rangePostedInvoices.length
      : 0;
    const outlierInvoices = invoiceAverage > 0
      ? rangePostedInvoices.filter(inv => normalizeBaseAmount(inv.totalAmount, inv.exchangeRate) > (invoiceAverage * 3)).length
      : 0;
    if (outlierInvoices > 0) {
      issues.push({
        severity: 'info',
        title: tr('مبالغ تحتاج تحققًا', 'Amounts need verification'),
        description: tr(
          `هناك ${outlierInvoices} فاتورة تتجاوز متوسط الفترة بأكثر من 3 أضعاف.`,
          `There are ${outlierInvoices} invoice(s) exceeding the period average by more than 3x.`
        )
      });
    }

    return issues;
  }, [rangePostedInvoices, postedTransactions, effectiveRange]);
  const smartSuggestions = useMemo<RankedMetric[]>(() => {
    const suggestions: RankedMetric[] = [];
    if (previousExpenses > 0 && expenseGrowth > 30) {
      suggestions.push({
        label: tr('المصاريف زادت بشكل ملحوظ', 'Expenses increased noticeably'),
        value: expenseGrowth,
        displayValue: `${formatAmount(expenseGrowth)}%`,
        note: tr('الزيادة مقارنة بالفترة السابقة المماثلة', 'Increase versus the previous matching period')
      });
    }
    if (previousRevenue > 0 && revenueGrowth < -15) {
      suggestions.push({
        label: tr('الإيرادات انخفضت وتحتاج متابعة', 'Revenue declined and needs follow-up'),
        value: Math.abs(revenueGrowth),
        displayValue: `${formatAmount(Math.abs(revenueGrowth))}%`,
        note: tr('راقب العملاء والمبيعات المتراجعة', 'Monitor declining customers and sales')
      });
    }
    if (periodMargin < 10 && periodRevenue > 0) {
      suggestions.push({
        label: tr('هامش الربح منخفض', 'Profit margin is low'),
        value: Math.abs(periodMargin),
        displayValue: `${formatAmount(Math.abs(periodMargin))}%`,
        note: tr('راجع تكلفة البضاعة والمصاريف التشغيلية', 'Review COGS and operating expenses')
      });
    }
    if (pendingIncomingChecks.length > 0) {
      suggestions.push({
        label: tr('تابع الشيكات الواردة المعلقة', 'Follow up pending incoming checks'),
        value: pendingIncomingChecks.length,
        displayValue: tr(`${pendingIncomingChecks.length} شيك`, `${pendingIncomingChecks.length} check(s)`),
        note: tr('تسريع التحصيل يحسن السيولة', 'Faster collection improves liquidity')
      });
    }
    if (lowStockItems.length > 0) {
      suggestions.push({
        label: tr('هناك أصناف منخفضة المخزون', 'There are low-stock items'),
        value: lowStockItems.length,
        displayValue: tr(`${lowStockItems.length} صنف`, `${lowStockItems.length} item(s)`),
        note: tr('أعد الطلب قبل تأثر المبيعات', 'Reorder before sales are affected')
      });
    }
    return suggestions.slice(0, 5);
  }, [previousExpenses, expenseGrowth, previousRevenue, revenueGrowth, periodMargin, periodRevenue, pendingIncomingChecks.length, lowStockItems.length]);
  const financialSummaryCards = useMemo<ResultCardMetric[]>(() => {
    const metrics: ResultCardMetric[] = [
      {
        label: tr('الإيرادات', 'Revenue'),
        value: `${formatAmount(periodRevenue)} ${baseCurrency}`,
        hint: tr(`النمو ${formatAmount(revenueGrowth)}%`, `Growth ${formatAmount(revenueGrowth)}%`),
        tone: revenueGrowth >= 0 ? 'positive' : 'warning'
      },
      {
        label: tr('المصاريف', 'Expenses'),
        value: `${formatAmount(periodExpenses)} ${baseCurrency}`,
        hint: tr(`التغير ${formatAmount(expenseGrowth)}%`, `Change ${formatAmount(expenseGrowth)}%`),
        tone: expenseGrowth > 30 ? 'warning' : 'neutral'
      },
      {
        label: tr('صافي الربح', 'Net profit'),
        value: `${formatAmount(periodProfit)} ${baseCurrency}`,
        hint: tr(`الهامش ${formatAmount(periodMargin)}%`, `Margin ${formatAmount(periodMargin)}%`),
        tone: periodProfit >= 0 ? 'positive' : 'danger'
      }
    ];

    if (mostProfitableCustomer) {
      metrics.push({
        label: tr('أكثر عميل ربحية', 'Most profitable customer'),
        value: mostProfitableCustomer.label,
        hint: `${formatAmount(mostProfitableCustomer.value)} ${baseCurrency}`,
        tone: 'positive'
      });
    }

    return metrics;
  }, [periodRevenue, revenueGrowth, periodExpenses, expenseGrowth, periodProfit, periodMargin, mostProfitableCustomer, baseCurrency]);
  const recommendationCards = useMemo<ResultCardMetric[]>(() => {
    const cards = smartSuggestions.slice(0, 3).map(item => ({
      label: item.label,
      value: item.displayValue || formatAmount(item.value),
      hint: item.note,
      tone: 'positive' as const
    }));

    if (cards.length < 3) {
      cards.push({
        label: tr('التنبؤ المالي', 'Financial forecast'),
        value: `${formatAmount(forecastNextMonthProfit)} ${baseCurrency}`,
        hint: tr('توقع مبسط للشهر القادم اعتمادًا على آخر 3 أشهر.', 'A simple next-month forecast based on the last 3 months.'),
        tone: forecastNextMonthProfit >= 0 ? 'positive' : 'warning'
      });
    }

    if (cards.length < 3 && topExpenseRows[0]) {
      cards.push({
        label: tr('أعلى بند مصروف', 'Top expense line'),
        value: topExpenseRows[0].label,
        hint: `${formatAmount(topExpenseRows[0].value)} ${baseCurrency}`,
        tone: 'warning'
      });
    }

    return cards.slice(0, 3);
  }, [smartSuggestions, forecastNextMonthProfit, baseCurrency, topExpenseRows]);
  const alertCards = useMemo<ResultCardMetric[]>(() => {
    const cards = smartIssues.slice(0, 3).map(issue => ({
      label: issue.title,
      value: issue.severity === 'error'
        ? tr('تنبيه حرج', 'Critical alert')
        : issue.severity === 'warning'
          ? tr('يتطلب مراجعة', 'Needs review')
          : tr('معلومة مهمة', 'Important note'),
      hint: issue.description,
      tone: issue.severity === 'error'
        ? 'danger'
        : issue.severity === 'warning'
          ? 'warning'
          : 'neutral'
    }));

    if (cards.length === 0) {
      cards.push({
        label: tr('لا توجد تنبيهات حرجة', 'No critical alerts'),
        value: tr('الوضع مستقر', 'Stable status'),
        hint: tr('لم يتم رصد أخطاء أو تكرار مهم في الفترة المحددة.', 'No important errors or duplicates were detected in the selected period.'),
        tone: 'positive'
      });
    }

    if (cards.length < 3 && pendingIncomingChecks.length > 0) {
      cards.push({
        label: tr('شيكات واردة معلقة', 'Pending incoming checks'),
        value: tr(`${pendingIncomingChecks.length} شيك`, `${pendingIncomingChecks.length} check(s)`),
        hint: tr('المتابعة المبكرة تقلل تأخر التحصيل.', 'Early follow-up reduces collection delays.'),
        tone: 'warning'
      });
    }

    if (cards.length < 3 && lowStockItems.length > 0) {
      cards.push({
        label: tr('أصناف منخفضة المخزون', 'Low-stock items'),
        value: tr(`${lowStockItems.length} صنف`, `${lowStockItems.length} item(s)`),
        hint: tr('أعد الطلب قبل تأثر المبيعات أو التوريد.', 'Reorder before sales or fulfillment are affected.'),
        tone: 'warning'
      });
    }

    return cards.slice(0, 3);
  }, [smartIssues, pendingIncomingChecks.length, lowStockItems.length]);
  const suggestedEntries = useMemo<SuggestedEntry[]>(() => {
    const recent = postedInvoices
      .filter(inv => !inv.isReversal)
      .sort((left, right) => `${right.date}-${right.invoiceNumber}`.localeCompare(`${left.date}-${left.invoiceNumber}`))
      .slice(0, 4);

    return recent.map(inv => {
      if (inv.type === TransactionType.INCOME && inv.category !== 'sales_return' && inv.category !== 'customer_credit_note') {
        return {
          title: tr(`قيد مقترح للفاتورة ${inv.invoiceNumber}`, `Suggested entry for invoice ${inv.invoiceNumber}`),
          debit: inv.paymentType === 'CASH'
            ? getAccountLabel(inv.paymentAccountId, tr('الصندوق / البنك', 'Cash / Bank'))
            : getAccountLabel('acc_receivable', tr('ذمم العملاء التجارية', 'Trade receivables')),
          credit: getAccountLabel('acc_sales', tr('إيرادات المبيعات', 'Sales revenue')),
          amount: normalizeBaseAmount(inv.totalAmount, inv.exchangeRate),
          note: tr('بناءً على نوع العملية وفاتورة المبيعات المرحلة', 'Based on transaction type and the posted sales invoice')
        };
      }

      const firstExpenseAccountId = inv.items.find(item => item.accountId)?.accountId;
      return {
        title: tr(`قيد مقترح للفاتورة ${inv.invoiceNumber}`, `Suggested entry for invoice ${inv.invoiceNumber}`),
        debit: getAccountLabel(firstExpenseAccountId, tr('مصروف تشغيلي', 'Operating expense')),
        credit: inv.paymentType === 'CASH'
          ? getAccountLabel(inv.paymentAccountId, tr('الصندوق / البنك', 'Cash / Bank'))
          : tr('ذمم الموردين / التزامات', 'Payables / liabilities'),
        amount: normalizeBaseAmount(inv.totalAmount, inv.exchangeRate),
        note: tr('استخدمه كنقطة بداية ثم راجع حسابات الطرف المقابل', 'Use it as a starting point, then review counter accounts')
      };
    });
  }, [postedInvoices, accountsById]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const buildLocalAssistantReply = (userMessage: string) => {
    const query = userMessage.toLowerCase();

    const stockIntent = /مخزون|الصنف|أصناف|نفاد|stock|inventory|reorder|low/.test(query);
    const checksIntent = /شيك|شيكات|check|checks|تحصيل|سند/.test(query);
    const financeIntent = /رصيد|سيولة|دخل|مصروف|ربح|خسارة|balance|income|expense|cash/.test(query);
    const journalIntent = /قيد|قيود|entry|entries|journal/.test(query);
    const expenseIntent = /مصروف|مصروفات|expense|expenses/.test(query);
    const reportIntent = /تقرير|report|summary/.test(query);
    const recommendationIntent = /توصية|توصيات|recommendation|recommendations/.test(query);
    const profitIntent = /أرباح|ارباح|خسائر|أرباح وخسائر|profit|loss/.test(query);
    const reviewIntent = /مراجعة|مراجعه|عمليات|تكرار|أخطاء|اخطاء|review|duplicate|error/.test(query);

    if (journalIntent) {
      const suggestions = [
        summary.totalIncome > 0
          ? tr('من ح/ الصندوق أو العملاء إلى ح/ المبيعات لإثبات الإيرادات القائمة.', 'Debit cash or receivables and credit sales to recognize recorded revenue.')
          : null,
        summary.totalExpense > 0
          ? tr('من ح/ المصروفات التشغيلية إلى ح/ الصندوق أو البنك لإثبات المصروفات المسجلة.', 'Debit operating expenses and credit cash or bank to recognize recorded expenses.')
          : null,
        pendingIncomingChecks.length > 0
          ? tr('من ح/ شيكات بالصندوق إلى ح/ ذمم العملاء أو التحصيل حسب مرحلة الشيك.', 'Debit checks in vault against receivables or collection based on the check stage.')
          : null
      ].filter(Boolean);

      return `${tr('اقتراح قيود محاسبية:', 'Suggested journal entries:')}\n${suggestions.length ? suggestions.map((line, idx) => `${idx + 1}. ${line}`).join('\n') : tr('لا توجد بيانات كافية لاقتراح قيود دقيقة الآن.', 'There is not enough data to suggest precise entries right now.')}`;
    }

    if (expenseIntent) {
      const expenseRatio = summary.totalIncome > 0 ? ((summary.totalExpense / summary.totalIncome) * 100) : 0;
      return `${tr('تحليل المصروفات الحالي:', 'Current expense analysis:')}\n- ${tr('إجمالي المصروفات', 'Total expenses')}: ${formatAmount(summary.totalExpense)} ${baseCurrency}\n- ${tr('نسبة المصروفات إلى الدخل', 'Expense-to-income ratio')}: ${formatAmount(expenseRatio)}%\n\n${tr('توصية:', 'Recommendation:')} ${expenseRatio > 70
        ? tr('المصروفات مرتفعة مقارنة بالدخل. راجع البنود المتكررة وخفّض المصروفات غير الأساسية.', 'Expenses are high versus income. Review recurring lines and reduce non-essential spending.')
        : tr('المصروفات ضمن نطاق مقبول حاليًا، مع الحاجة لمتابعة البنود الأعلى تكلفة دوريًا.', 'Expenses are within an acceptable range for now, with continued review of the highest-cost lines.')}`;
    }

    if (profitIntent) {
      const profit = Number(summary.totalIncome || 0) - Number(summary.totalExpense || 0);
      return `${tr('تحليل الأرباح والخسائر:', 'Profit and loss analysis:')}\n- ${tr('إجمالي الدخل', 'Total income')}: ${formatAmount(summary.totalIncome)} ${baseCurrency}\n- ${tr('إجمالي المصروفات', 'Total expenses')}: ${formatAmount(summary.totalExpense)} ${baseCurrency}\n- ${tr('النتيجة الحالية', 'Current result')}: ${formatAmount(profit)} ${baseCurrency}\n\n${tr('قراءة سريعة:', 'Quick read:')} ${profit >= 0
        ? tr('الوضع الحالي يحقق فائضًا تشغيليًا.', 'The current position shows an operating surplus.')
        : tr('الوضع الحالي يسجل عجزًا يحتاج إلى معالجة سريعة.', 'The current position shows a deficit that needs quick attention.')}`;
    }

    if (reportIntent) {
      return `${tr('تقرير ذكي مختصر:', 'Smart report summary:')}\n- ${tr('الرصيد الصافي', 'Net balance')}: ${formatAmount(summary.netBalance)} ${baseCurrency}\n- ${tr('إجمالي الدخل', 'Total income')}: ${formatAmount(summary.totalIncome)} ${baseCurrency}\n- ${tr('إجمالي المصروفات', 'Total expenses')}: ${formatAmount(summary.totalExpense)} ${baseCurrency}\n- ${tr('الشيكات المعلقة', 'Pending checks')}: ${formatQty(pendingIncomingChecks.length + pendingOutgoingChecks.length)}\n- ${tr('الأصناف منخفضة المخزون', 'Low-stock items')}: ${formatQty(lowStockItems.length)}`;
    }

    if (recommendationIntent) {
      const recommendations = [
        summary.totalExpense > summary.totalIncome ? tr('راجع المصروفات الشهرية لأنها تتجاوز الدخل الحالي.', 'Review monthly expenses because they exceed current income.') : tr('استمر في مراقبة هامش الربح للحفاظ على الفائض الحالي.', 'Keep monitoring profit margin to preserve the current surplus.'),
        pendingIncomingChecks.length > 0 ? tr('تابع الشيكات الواردة حسب تاريخ الاستحقاق لتسريع التحصيل.', 'Track incoming checks by due date to speed up collection.') : tr('ركز على تحصيل الذمم المفتوحة لتعزيز السيولة.', 'Focus on collecting open receivables to strengthen liquidity.'),
        lowStockItems.length > 0 ? tr('أعد طلب الأصناف منخفضة المخزون قبل تأثر المبيعات.', 'Reorder low-stock items before sales are affected.') : tr('لا توجد مخاطر فورية على المخزون، استمر بالمراقبة الدورية.', 'There is no immediate stock risk; keep periodic monitoring.')
      ];

      return `${tr('توصيات مالية ذكية:', 'Smart financial recommendations:')}\n${recommendations.map((line, idx) => `${idx + 1}. ${line}`).join('\n')}`;
    }

    if (reviewIntent) {
      const recentCount = Math.min(5, transactions.length);
      return `${tr('مراجعة العمليات الحالية:', 'Current operations review:')}\n- ${tr('آخر العمليات المتاحة للمراجعة', 'Recent transactions available for review')}: ${formatQty(recentCount)}\n- ${tr('إشارات تحتاج متابعة', 'Signals to monitor')}: ${formatQty((pendingIncomingChecks.length + pendingOutgoingChecks.length) + lowStockItems.length)}\n\n${tr('تنبيه:', 'Alert:')} ${tr('راجِع العمليات المتقاربة زمنيًا أو المتشابهة في القيمة لاكتشاف أي تكرار أو إدخال غير مقصود.', 'Review transactions that are close in time or similar in value to detect duplicates or unintended entries.')}`;
    }

    if (stockIntent) {
      const stockLines = lowStockItems.length
        ? lowStockItems
            .map((item, idx) => `${idx + 1}. ${item.name} (${tr('المتوفر', 'stock')}: ${formatQty(item.stock)})`)
            .join('\n')
        : tr('لا توجد أصناف منخفضة عن الحد الحالي.', 'No low-stock items at the moment.');
      return `${tr('تحليل محلي للمخزون:', 'Local inventory analysis:')}\n${stockLines}\n\n${tr('توصية:', 'Recommendation:')} ${tr('راجع نقاط إعادة الطلب وحدّث الكميات الحرجة للأصناف المتكررة.', 'Review reorder points and update critical quantities for recurring items.')}`;
    }

    if (checksIntent) {
      const incomingTotal = pendingIncomingChecks.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      const outgoingTotal = pendingOutgoingChecks.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      return `${tr('ملخص الشيكات الحالي:', 'Current checks summary:')}\n- ${tr('شيكات واردة معلقة', 'Pending incoming checks')}: ${formatQty(pendingIncomingChecks.length)} (${formatAmount(incomingTotal)} ${baseCurrency})\n- ${tr('شيكات صادرة معلقة', 'Pending outgoing checks')}: ${formatQty(pendingOutgoingChecks.length)} (${formatAmount(outgoingTotal)} ${baseCurrency})\n\n${tr('توصية:', 'Recommendation:')} ${tr('رتب الشيكات حسب تاريخ الاستحقاق لتقليل مخاطر التأخير.', 'Sort checks by due date to reduce delay risk.')}`;
    }

    if (financeIntent) {
      return `${tr('الملخص المالي الحالي:', 'Current financial summary:')}\n- ${tr('الرصيد الصافي', 'Net balance')}: ${formatAmount(summary.netBalance)} ${baseCurrency}\n- ${tr('إجمالي الدخل', 'Total income')}: ${formatAmount(summary.totalIncome)} ${baseCurrency}\n- ${tr('إجمالي المصروفات', 'Total expenses')}: ${formatAmount(summary.totalExpense)} ${baseCurrency}\n\n${tr('ملاحظة:', 'Note:')} ${tr('هذا الرد من الوضع المحلي بدون ربط سحابي.', 'This response is from local mode without cloud AI connection.')}`;
    }

    const recentCount = Math.min(5, transactions.length);
    return `${tr('تم تفعيل المساعد الذكي في الوضع المحلي.', 'Smart assistant is enabled in local mode.')}\n${tr('آخر العمليات المتاحة للتحليل', 'Recent transactions available for analysis')}: ${formatQty(recentCount)}\n${tr('يمكنك السؤال عن:', 'You can ask about:')} ${tr('المخزون، الشيكات، الرصيد، المصروفات، أو الدخل.', 'inventory, checks, balance, expenses, or income.')}`;
  };

  const sendAssistantPrompt = async (userMessage: string) => {
    if (!userMessage.trim()) return;

    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setLoading(true);

    if (!cloudAiEnabled) {
      const localReply = buildLocalAssistantReply(userMessage);
      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          text: localReply,
          type: useThinking ? 'thought' : (useSearch ? 'search' : undefined)
        }
      ]);
      setLoading(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });

      const financialContext = `
        Current Business State:
        - Currency: ${baseCurrency}
        - Net Balance: ${summary.netBalance}
        - Total Income: ${summary.totalIncome}
        - Total Expenses: ${summary.totalExpense}
        - Vault Incoming Checks: ${checks.filter(c => c.status === 'PENDING' && c.type === 'INCOMING').length}
        - Low Stock Items: ${products.filter(p => isStockProduct(p) && p.stock < 5).length}

        Recent Events:
        ${transactions.slice(0, 5).map(t => `- ${t.type}: ${t.amount} (${t.description})`).join('\n')}
      `;

      let modelName = 'gemini-3-flash-preview';
      const config: any = {};

      if (useThinking) {
        modelName = 'gemini-3-pro-preview';
        config.thinkingConfig = { thinkingBudget: 32768 };
      }

      if (useSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const prompt = `
        You are a senior financial advisor for an ERP app called "${assistantDisplayName}".
        The user language is ${assistantLanguage}.
        Context: ${financialContext}
        User Query: ${userMessage}

        Requirements:
        1. Be professional and concise.
        2. If Thinking mode is ON, show deep analytical reasoning.
        3. If Search mode is ON, provide real-world economic context if relevant.
        4. Format numbers clearly.
        5. When relevant, organize the answer into short sections such as:
           - Financial summary
           - Smart recommendations
           - Alerts or anomalies
           - Suggested journal entries
      `;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config
      });

      const responseText = response.text || tr('عذراً، لم أستطع معالجة طلبك حالياً.', 'Sorry, I could not process your request right now.');

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      let finalMsg = responseText;
      if (chunks && chunks.length > 0) {
        const links = chunks.map((c: any) => c.web?.uri).filter(Boolean);
        if (links.length > 0) {
          finalMsg += `\n\n${tr('المصادر المعتمدة:', 'Sources:')}\n${links.join('\n')}`;
        }
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          text: finalMsg,
          type: useThinking ? 'thought' : (useSearch ? 'search' : undefined)
        }
      ]);
    } catch (error: any) {
      console.error('AI Error:', error);

      let errorMessage = tr(
        'حدث خطأ غير متوقع في الاتصال بالذكاء الاصطناعي.',
        'An unexpected AI connection error occurred.'
      );

      if (error.message) {
        if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('resource_exhausted')) {
          errorMessage = tr(
            'عذراً، تم تجاوز حد الاستخدام المسموح به أو أن الخدمة مشغولة جداً. يرجى المحاولة لاحقاً.',
            'Usage quota exceeded or service is busy. Please try again later.'
          );
        } else if (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
          errorMessage = tr(
            'يبدو أن هناك مشكلة في الاتصال بالإنترنت. يرجى التحقق من الشبكة والمحاولة مرة أخرى.',
            'There seems to be a network issue. Please check your connection and try again.'
          );
        } else if (error.message.includes('500') || error.message.includes('503') || error.message.includes('internal')) {
          errorMessage = tr(
            'خادم الذكاء الاصطناعي يواجه مشكلة مؤقتة. يرجى المحاولة بعد قليل.',
            'AI server has a temporary issue. Please retry shortly.'
          );
        } else if (error.message.includes('safety') || error.message.includes('blocked')) {
          errorMessage = tr(
            'تم حظر الاستجابة لأنها قد تنتهك معايير الأمان والمحتوى.',
            'The response was blocked due to safety or content policy.'
          );
        } else if (error.message.includes('403') || error.message.includes('permission')) {
          errorMessage = tr(
            'عذراً، لا تملك الصلاحية للوصول إلى هذا النموذج أو الخدمة.',
            'You do not have permission to access this model or service.'
          );
        } else if (error.message.includes('404') || error.message.includes('not_found')) {
          errorMessage = tr(
            'النموذج المطلوب غير متوفر حالياً.',
            'The requested model is currently unavailable.'
          );
        }
      }

      setMessages(prev => [...prev, { role: 'model', text: errorMessage, type: 'error' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setInput('');
    await sendAssistantPrompt(userMessage);
  };

  const quickActions = [
    {
      key: 'start-analysis',
      label: tr('ابدأ التحليل', 'Start Analysis'),
      prompt: tr('ابدأ تحليلًا شاملًا للبيانات الحالية، وقدّم ملخصًا ماليًا وتوصيات ذكية وتنبيهات إن وجدت.', 'Start a full analysis of the current data and provide a financial summary, smart recommendations, and alerts if any.'),
      icon: PlayCircle
    },
    {
      key: 'suggest-entries',
      label: tr('اقتراح قيود', 'Suggest Entries'),
      prompt: tr('اقترح قيودًا محاسبية مناسبة بناءً على البيانات والعمليات الحالية.', 'Suggest suitable journal entries based on the current data and transactions.'),
      icon: Scale
    },
    {
      key: 'expense-analysis',
      label: tr('تحليل المصروفات', 'Analyze Expenses'),
      prompt: tr('حلل المصروفات الحالية وبيّن أهم البنود التي تحتاج إلى متابعة.', 'Analyze current expenses and highlight the most important lines that need attention.'),
      icon: Receipt
    },
    {
      key: 'smart-report',
      label: tr('إنشاء تقرير ذكي', 'Generate Smart Report'),
      prompt: tr('أنشئ تقريرًا ذكيًا مختصرًا عن الوضع المالي الحالي.', 'Create a concise smart report about the current financial position.'),
      icon: FileText
    },
    {
      key: 'financial-recommendations',
      label: tr('توصيات مالية', 'Financial Recommendations'),
      prompt: tr('قدّم توصيات مالية عملية لتحسين السيولة والربحية.', 'Provide practical financial recommendations to improve liquidity and profitability.'),
      icon: Wallet
    },
    {
      key: 'profit-loss',
      label: tr('تحليل الأرباح والخسائر', 'Profit & Loss Analysis'),
      prompt: tr('حلل الأرباح والخسائر الحالية وفسّر النتيجة باختصار.', 'Analyze the current profit and loss position and explain the result briefly.'),
      icon: BarChart3
    },
    {
      key: 'detect-errors',
      label: tr('اكتشاف الأخطاء', 'Detect Errors'),
      prompt: tr('راجع العمليات الحالية واكتشف الأخطاء أو التكرار أو النقاط التي تحتاج تنبيهًا.', 'Review the current operations and detect errors, duplication, or items that need attention.'),
      icon: Brain
    },
    {
      key: 'review-accounts',
      label: tr('مراجعة الحسابات', 'Review Accounts'),
      prompt: tr('راجع الحسابات المستخدمة في القيود الحالية وحدد أي حسابات تحتاج تصحيحًا أو متابعة.', 'Review the accounts used in current entries and identify any accounts that need correction or follow-up.'),
      icon: Scale
    },
    {
      key: 'run-assistant',
      label: tr('تشغيل المساعد الذكي', 'Run Smart Assistant'),
      prompt: tr('عرّفني بأهم ما يمكنك تحليله الآن داخل النظام.', 'Tell me the most important things you can analyze right now in the system.'),
      icon: Sparkles
    }
  ];
  const rangeQuickActions = [
    {
      key: 'range-analysis',
      label: tr('تحليل فترة محددة', 'Analyze Selected Period'),
      action: () => void sendAssistantPrompt(
        tr(
          `حلل الفترة من ${effectiveRange.start} إلى ${effectiveRange.end}، وركّز على الإيرادات والمصروفات والأرباح والتنبيهات.`,
          `Analyze the period from ${effectiveRange.start} to ${effectiveRange.end}, focusing on revenue, expenses, profit, and alerts.`
        )
      )
    },
    {
      key: 'range-report',
      label: tr('إنشاء تقرير ذكي', 'Generate Smart Report'),
      action: () => void sendAssistantPrompt(
        tr(
          `أنشئ تقريرًا ذكيًا للفترة من ${effectiveRange.start} إلى ${effectiveRange.end} مع ملخص مالي وتوصيات.`,
          `Generate a smart report for the period from ${effectiveRange.start} to ${effectiveRange.end} with a financial summary and recommendations.`
        )
      )
    },
    {
      key: 'range-errors',
      label: tr('اكتشاف الأخطاء', 'Detect Errors'),
      action: () => void sendAssistantPrompt(
        tr(
          `اكتشف الأخطاء أو التكرار أو المبالغ غير المنطقية خلال الفترة من ${effectiveRange.start} إلى ${effectiveRange.end}.`,
          `Detect errors, duplicates, or unreasonable amounts during the period from ${effectiveRange.start} to ${effectiveRange.end}.`
        )
      )
    },
    {
      key: 'range-accounts',
      label: tr('مراجعة الحسابات', 'Review Accounts'),
      action: () => void sendAssistantPrompt(
        tr(
          `راجع الحسابات والحركات المرحلة خلال الفترة من ${effectiveRange.start} إلى ${effectiveRange.end} واذكر ما يحتاج متابعة.`,
          `Review the posted accounts and movements from ${effectiveRange.start} to ${effectiveRange.end} and mention what needs attention.`
        )
      )
    }
  ];

  return (
    <div
      className="app-page flex flex-col p-3 sm:p-4 font-tajawal animate-in fade-in min-h-0"
      style={{ minHeight: 'calc(100dvh - var(--app-safe-top) - var(--app-nav-height) - var(--app-safe-bottom) - 4.75rem)' }}
      dir={isEnglish ? 'ltr' : 'rtl'}
    >
      <header className={`mb-4 flex ${isTablet ? 'items-center gap-4' : 'items-start justify-between gap-2'}`}>
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600" />
            {assistantDisplayName}
          </h1>
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest mt-1">{tr('مدعوم بتقنيات Gemini 3', 'Powered by Gemini 3')}</p>
          <div className="mt-1 text-[10px] font-black">
            <span className={`px-2 py-1 rounded-lg border ${cloudAiEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
              {cloudAiEnabled ? tr('الوضع السحابي مفعل', 'Cloud AI mode enabled') : tr('الوضع المحلي مفعل', 'Local smart mode enabled')}
            </span>
          </div>
        </div>
        <div className={`flex gap-2 ${isTablet ? 'shrink-0' : ''}`}>
          {onOpenVoiceAssistant && (
            <button
              onClick={onOpenVoiceAssistant}
              className="p-3 rounded-2xl border transition-all flex items-center gap-2 bg-purple-600 text-white border-purple-600 shadow-lg hover:bg-purple-700"
              title={tr('فتح المساعد الصوتي', 'Open Voice Assistant')}
            >
              <Mic size={18} />
              <span className="text-[9px] font-black uppercase hidden md:block">{tr('مساعد صوتي', 'Voice')}</span>
            </button>
          )}
          <button
            onClick={() => { setUseThinking(!useThinking); if (!useThinking) setUseSearch(false); }}
            className={`p-3 rounded-2xl border transition-all flex items-center gap-2 ${useThinking ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'}`}
            title={tr('وضع التفكير العميق', 'Deep Thinking Mode')}
          >
            <Brain size={18} />
            <span className="text-[9px] font-black uppercase hidden md:block">{tr('تحليل عميق', 'Deep Analysis')}</span>
          </button>
          <button
            onClick={() => { setUseSearch(!useSearch); if (!useSearch) setUseThinking(false); }}
            className={`p-3 rounded-2xl border transition-all flex items-center gap-2 ${useSearch ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'}`}
            title={tr('البحث المباشر من جوجل', 'Direct Google Search')}
          >
            <Globe size={18} />
            <span className="text-[9px] font-black uppercase hidden md:block">{tr('بحث مباشر', 'Live Search')}</span>
          </button>
        </div>
      </header>

      <section className="mb-3 sm:mb-4 relative overflow-hidden rounded-[1.6rem] sm:rounded-[2rem] border border-violet-100 bg-[linear-gradient(145deg,rgba(248,250,252,1)_0%,rgba(245,243,255,1)_46%,rgba(238,242,255,1)_100%)] p-4 sm:p-5 shadow-sm">
        <div className="absolute -top-10 right-0 h-28 w-28 rounded-full bg-violet-200/30 blur-3xl" />
        <div className="absolute -bottom-10 left-0 h-24 w-24 rounded-full bg-blue-200/30 blur-3xl" />

        <div className="relative space-y-3 sm:space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-black text-violet-700 shadow-sm">
                <Sparkles className="w-4 h-4" />
                {assistantDisplayName}
              </div>
              <h2 className="mt-2 sm:mt-3 text-base sm:text-xl font-black text-slate-900">{assistantMarketingTitle}</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-black text-slate-700 shadow-sm">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <Wallet className="w-4 h-4 text-violet-600" />
                {tr('تحليل + توصيات', 'Analysis + Recommendations')}
              </div>
              <div className={`px-3 py-1.5 rounded-full text-[11px] font-black border ${cloudAiEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                {cloudAiEnabled ? tr('تحليل سحابي ومباشر', 'Cloud-powered analysis') : tr('تحليل محلي ذكي', 'Local smart analysis')}
              </div>
            </div>
          </div>

          <p className="text-[13px] sm:text-sm font-bold leading-6 sm:leading-7 text-slate-700">{assistantInsideDescription}</p>

          <div className="rounded-[1.2rem] sm:rounded-[1.5rem] border border-white/80 bg-white/85 p-3 sm:p-4 shadow-sm space-y-2">
            <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.16em]">
              {tr('رسالة الميزة', 'Feature promise')}
            </div>
            <p className="text-[13px] sm:text-sm font-bold leading-6 sm:leading-7 text-slate-700">{assistantMarketingDescription}</p>
          </div>
        </div>
      </section>

      <section className="mb-3 sm:mb-4 grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-4 gap-2 sm:gap-3">
        {quickActions.map(action => (
          <button
            key={action.key}
            type="button"
            onClick={() => { void sendAssistantPrompt(action.prompt); }}
            disabled={loading}
            className="rounded-[1.1rem] sm:rounded-[1.4rem] border border-slate-200 bg-white px-2.5 py-3 sm:px-4 sm:py-4 text-center shadow-sm transition-all hover:border-violet-200 hover:shadow-md disabled:opacity-60"
          >
            <div className="inline-flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl sm:rounded-2xl bg-violet-50 text-violet-700">
              <action.icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="mt-2 sm:mt-3 text-[10px] sm:text-sm font-black text-slate-900 leading-5 sm:leading-6">{action.label}</div>
          </button>
        ))}
      </section>

      <section className="mb-4 rounded-[1.6rem] sm:rounded-[2rem] border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm space-y-3 sm:space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-base sm:text-lg font-black text-slate-900">{tr('التحليل الذكي', 'Smart Analytics')}</div>
            <div className="mt-1 text-[12px] font-bold text-slate-500">
              {tr('حلل المصروفات والإيرادات والأرباح مع منطق ذكي يعتمد على بياناتك الحالية.', 'Analyze expenses, revenue, and profit with smart logic based on your current data.')}
            </div>
          </div>
          <div className="rounded-xl sm:rounded-2xl bg-slate-900 px-2.5 sm:px-3 py-2 text-[10px] sm:text-[11px] font-black text-white">
            {effectiveRange.start} {'->'} {effectiveRange.end}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3">
          <div>
            <label className="block text-[11px] font-black text-slate-500 mb-1">{tr('من تاريخ', 'From date')}</label>
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="w-full rounded-xl sm:rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:py-3 text-sm font-black text-slate-700 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-black text-slate-500 mb-1">{tr('إلى تاريخ', 'To date')}</label>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="w-full rounded-xl sm:rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:py-3 text-sm font-black text-slate-700 outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <div className="text-[11px] font-black text-slate-500 mb-1">{tr('الإجراءات السريعة', 'Quick Actions')}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
              {rangeQuickActions.map(action => (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.action}
                  disabled={loading}
                  className="rounded-xl sm:rounded-2xl border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-2.5 sm:py-3 text-[10px] sm:text-[11px] font-black text-slate-700 transition-all hover:border-violet-200 hover:bg-violet-50 disabled:opacity-60"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
          <AnalyticsTabButton
            active={analysisTab === 'expenses'}
            label={tr('تحليل المصروفات', 'Expense Analysis')}
            icon={<Receipt className="w-4 h-4" />}
            onClick={() => setAnalysisTab('expenses')}
          />
          <AnalyticsTabButton
            active={analysisTab === 'revenue'}
            label={tr('تحليل الإيرادات', 'Revenue Analysis')}
            icon={<Wallet className="w-4 h-4" />}
            onClick={() => setAnalysisTab('revenue')}
          />
          <AnalyticsTabButton
            active={analysisTab === 'profit'}
            label={tr('تحليل الأرباح', 'Profit Analysis')}
            icon={<BarChart3 className="w-4 h-4" />}
            onClick={() => setAnalysisTab('profit')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <AnalyticsMetricCard
            title={tr('إيرادات الفترة', 'Period revenue')}
            value={`${formatAmount(periodRevenue)} ${baseCurrency}`}
            subtitle={tr(`النمو ${formatAmount(revenueGrowth)}%`, `Growth ${formatAmount(revenueGrowth)}%`)}
            tone="emerald"
          />
          <AnalyticsMetricCard
            title={tr('مصاريف الفترة', 'Period expenses')}
            value={`${formatAmount(periodExpenses)} ${baseCurrency}`}
            subtitle={tr(`التغير ${formatAmount(expenseGrowth)}%`, `Change ${formatAmount(expenseGrowth)}%`)}
            tone="rose"
          />
          <AnalyticsMetricCard
            title={tr('صافي الربح', 'Net profit')}
            value={`${formatAmount(periodProfit)} ${baseCurrency}`}
            subtitle={tr(`الهامش ${formatAmount(periodMargin)}%`, `Margin ${formatAmount(periodMargin)}%`)}
            tone="violet"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4">
          <StructuredResultCard
            title={tr('ملخص مالي', 'Financial Summary')}
            description={tr('نظرة مركزة على نتيجة الفترة الحالية والمؤشرات الأهم.', 'A focused view of the current period result and the most important indicators.')}
            icon={<Wallet className="w-5 h-5" />}
            tone="violet"
            items={financialSummaryCards}
          />
          <StructuredResultCard
            title={tr('توصيات ذكية', 'Smart Recommendations')}
            description={tr('أهم الخطوات المقترحة لتحسين السيولة والربحية والمتابعة.', 'Top suggested actions to improve liquidity, profitability, and follow-up.')}
            icon={<Sparkles className="w-5 h-5" />}
            tone="emerald"
            items={recommendationCards}
          />
          <StructuredResultCard
            title={tr('تنبيهات', 'Alerts')}
            description={tr('أخطاء أو إشارات تستحق المراجعة خلال الفترة المحددة.', 'Errors or signals worth reviewing during the selected period.')}
            icon={<AlertCircle className="w-5 h-5" />}
            tone="amber"
            items={alertCards}
          />
        </div>

        {analysisTab === 'expenses' && (
          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
            <AnalyticsPanel
              title={tr('رسم بياني للمصروفات', 'Expense chart')}
              description={tr('يعرض المصروفات خلال آخر 6 أشهر.', 'Shows expenses across the last 6 months.')}
            >
              <MetricBarChart
                items={monthlyInsights.map(item => ({ label: item.label, value: item.expenses }))}
                emptyLabel={tr('لا توجد مصروفات كافية للرسم البياني', 'Not enough expense data for the chart')}
                valueFormatter={(value) => `${formatAmount(value)} ${baseCurrency}`}
                tone="rose"
              />
            </AnalyticsPanel>
            <AnalyticsPanel
              title={tr('أعلى 5 مصاريف', 'Top 5 expenses')}
              description={tr('أكبر الحسابات أو البنود استنزافًا خلال الفترة.', 'The biggest accounts or lines consuming spend during the period.')}
            >
              <MetricBarChart
                items={topExpenseRows}
                emptyLabel={tr('لا توجد بيانات مصروفات ضمن الفترة', 'No expense data in this period')}
                valueFormatter={(value) => `${formatAmount(value)} ${baseCurrency}`}
                tone="rose"
              />
            </AnalyticsPanel>
          </div>
        )}

        {analysisTab === 'revenue' && (
          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
            <AnalyticsPanel
              title={tr('رسم بياني للإيرادات', 'Revenue chart')}
              description={tr('إيرادات آخر 6 أشهر مع صافي المرتجعات.', 'Revenue across the last 6 months including net returns.')}
            >
              <MetricBarChart
                items={monthlyInsights.map(item => ({ label: item.label, value: item.revenue }))}
                emptyLabel={tr('لا توجد بيانات إيرادات كافية', 'Not enough revenue data')}
                valueFormatter={(value) => `${formatAmount(value)} ${baseCurrency}`}
                tone="emerald"
              />
            </AnalyticsPanel>
            <AnalyticsPanel
              title={tr('أعلى العملاء إيرادًا', 'Top revenue customers')}
              description={tr('أكثر العملاء تحقيقًا للإيراد داخل الفترة المحددة.', 'Customers generating the most revenue in the selected period.')}
            >
              <MetricBarChart
                items={topRevenueCustomers}
                emptyLabel={tr('لا توجد فواتير مبيعات ضمن الفترة', 'No sales invoices in the selected period')}
                valueFormatter={(value) => `${formatAmount(value)} ${baseCurrency}`}
                tone="emerald"
              />
            </AnalyticsPanel>
            <div className="xl:col-span-2 rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-sm font-black text-emerald-900">{tr('أكثر عميل ربحية', 'Most profitable customer')}</div>
              {mostProfitableCustomer ? (
                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-lg font-black text-slate-900">{mostProfitableCustomer.label}</div>
                    <div className="mt-1 text-[12px] font-bold text-slate-600">{mostProfitableCustomer.note}</div>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-700 shadow-sm">
                    {formatAmount(mostProfitableCustomer.value)} {baseCurrency}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm font-bold text-emerald-800">{tr('لا توجد بيانات كافية لحساب الربحية حسب العميل.', 'There is not enough data to calculate customer profitability yet.')}</div>
              )}
            </div>
          </div>
        )}

        {analysisTab === 'profit' && (
          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
            <AnalyticsPanel
              title={tr('رسم بياني للأرباح', 'Profit chart')}
              description={tr('صافي الربح الشهري لآخر 6 أشهر.', 'Monthly net profit for the last 6 months.')}
            >
              <MetricBarChart
                items={monthlyInsights.map(item => ({ label: item.label, value: item.profit }))}
                emptyLabel={tr('لا توجد بيانات كافية للأرباح', 'Not enough profit data')}
                valueFormatter={(value) => `${formatAmount(value)} ${baseCurrency}`}
                tone="violet"
              />
            </AnalyticsPanel>
            <AnalyticsPanel
              title={tr('التنبؤ المالي', 'Financial forecast')}
              description={tr('توقع مبسط يعتمد على متوسط آخر 3 أشهر ومعدل النمو.', 'A simple forecast based on the average of the last 3 months and growth rate.')}
            >
              <div className="rounded-[1.35rem] border border-violet-100 bg-violet-50 px-4 py-4">
                <div className="text-[11px] font-black text-violet-700">{tr('الربح المتوقع للشهر القادم', 'Expected profit next month')}</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{formatAmount(forecastNextMonthProfit)} {baseCurrency}</div>
                <div className="mt-2 text-[12px] font-bold leading-6 text-slate-600">
                  {tr('كلما زادت جودة البيانات المرحّلة زادت دقة هذا التوقع.', 'The better the posted data quality, the more accurate this forecast becomes.')}
                </div>
              </div>
            </AnalyticsPanel>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <AnalyticsPanel
            title={tr('اقتراح القيود تلقائيًا', 'Automatic journal suggestions')}
            description={tr('اقتراحات Rule-based مبنية على الفواتير والعمليات الأخيرة.', 'Rule-based suggestions built from recent invoices and operations.')}
          >
            <div className="space-y-3">
              {suggestedEntries.length === 0 && (
                <div className="text-sm font-bold text-slate-400">{tr('لا توجد مستندات كافية لاقتراح قيود الآن.', 'There are not enough documents to suggest journal entries right now.')}</div>
              )}
              {suggestedEntries.map((entry, index) => (
                <div key={`${entry.title}-${index}`} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-black text-slate-900">{entry.title}</div>
                  <div className="mt-2 text-[12px] font-bold text-slate-700">{tr('من ح/', 'Debit')}: {entry.debit}</div>
                  <div className="mt-1 text-[12px] font-bold text-slate-700">{tr('إلى ح/', 'Credit')}: {entry.credit}</div>
                  <div className="mt-1 text-[12px] font-black text-violet-700">{formatAmount(entry.amount)} {baseCurrency}</div>
                  {entry.note && <div className="mt-2 text-[11px] font-bold text-slate-500">{entry.note}</div>}
                </div>
              ))}
            </div>
          </AnalyticsPanel>

          <AnalyticsPanel
            title={tr('التوصيات والتنبيهات الذكية', 'Smart suggestions and alerts')}
            description={tr('منطق فعلي لاكتشاف الأخطاء والزيادات غير الطبيعية والتنبيهات المهمة.', 'Real logic for detecting errors, unusual increases, and important alerts.')}
          >
            <div className="space-y-3">
              {smartSuggestions.map((item, index) => (
                <div key={`${item.label}-${index}`} className="rounded-[1.25rem] border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <div className="text-sm font-black text-emerald-900">{item.label}</div>
                  <div className="mt-1 text-[12px] font-bold text-emerald-700">{item.note}</div>
                </div>
              ))}
              {smartIssues.map((issue, index) => (
                <div
                  key={`${issue.title}-${index}`}
                  className={`rounded-[1.25rem] border px-4 py-3 ${issue.severity === 'error'
                    ? 'border-rose-200 bg-rose-50'
                    : issue.severity === 'warning'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-blue-200 bg-blue-50'
                    }`}
                >
                  <div className={`text-sm font-black ${issue.severity === 'error'
                    ? 'text-rose-900'
                    : issue.severity === 'warning'
                      ? 'text-amber-900'
                      : 'text-blue-900'
                    }`}
                  >
                    {issue.title}
                  </div>
                  <div className={`mt-1 text-[12px] font-bold ${issue.severity === 'error'
                    ? 'text-rose-700'
                    : issue.severity === 'warning'
                      ? 'text-amber-700'
                      : 'text-blue-700'
                    }`}
                  >
                    {issue.description}
                  </div>
                </div>
              ))}
              {smartSuggestions.length === 0 && smartIssues.length === 0 && (
                <div className="text-sm font-bold text-slate-400">
                  {tr('لا توجد تنبيهات أو توصيات حرجة ضمن الفترة الحالية.', 'There are no critical alerts or recommendations in the current period.')}
                </div>
              )}
            </div>
          </AnalyticsPanel>
        </div>
      </section>

      {!hasAnalysisData && (
        <div className="mb-4 rounded-[1.6rem] border border-amber-200 bg-amber-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-black text-amber-900">{assistantEmptyTitle}</div>
              <div className="mt-1 text-[12px] font-bold leading-6 text-amber-800">{assistantEmptyText}</div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="mb-4 rounded-[1.6rem] border border-blue-100 bg-blue-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <Loader2 className="w-5 h-5 text-blue-700 shrink-0 mt-0.5 animate-spin" />
            <div>
              <div className="text-sm font-black text-blue-900">{assistantLoadingTitle}</div>
              <div className="mt-1 text-[12px] font-bold leading-6 text-blue-800">{assistantLoadingText}</div>
            </div>
          </div>
        </div>
      )}

      {!loading && successfulAnalysesCount > 0 && (
        <div className="mb-4 rounded-[1.6rem] border border-emerald-100 bg-emerald-50 px-4 py-4 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-black text-emerald-900">{assistantSuccessTitle}</div>
              <div className="mt-1 text-[12px] font-bold leading-6 text-emerald-800">{assistantSuccessText}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/80 bg-white/85 px-3 py-2 text-[11px] font-black text-slate-700">{tr('📊 ملخص مالي', 'Financial Summary')}</div>
            <div className="rounded-xl border border-white/80 bg-white/85 px-3 py-2 text-[11px] font-black text-slate-700">{tr('💡 توصيات ذكية', 'Smart Recommendations')}</div>
            <div className="rounded-xl border border-white/80 bg-white/85 px-3 py-2 text-[11px] font-black text-slate-700">{tr('⚠️ تنبيهات', 'Alerts')}</div>
          </div>
        </div>
      )}

      <div className="flex-1 bg-white rounded-[2.5rem] shadow-inner border border-gray-100 p-5 overflow-y-auto mb-4 scroll-smooth" ref={scrollRef}>
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex mb-6 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] p-5 rounded-[2rem] shadow-sm relative ${
              msg.role === 'user'
                ? 'bg-slate-800 text-white rounded-br-none'
                : msg.type === 'error'
                  ? 'bg-rose-50 text-rose-800 rounded-bl-none border border-rose-100'
                  : 'bg-slate-50 text-slate-800 rounded-bl-none border border-slate-100'
            }`}>
              {msg.role === 'model' && (
                <div className="flex items-center gap-2 mb-3">
                  {msg.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  ) : (
                    <Bot className={`w-4 h-4 ${msg.type === 'thought' ? 'text-indigo-600' : 'text-purple-600'}`} />
                  )}
                  <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${msg.type === 'error' ? 'text-rose-400' : 'text-gray-400'}`}>
                    {msg.type === 'thought'
                      ? tr('تفكير عميق', 'Deep Reasoning')
                      : msg.type === 'search'
                        ? tr('نتائج بحث', 'Search Results')
                        : msg.type === 'error'
                          ? tr('تنبيه النظام', 'System Alert')
                          : tr('إجابة ذكية', 'Smart Answer')}
                  </span>
                </div>
              )}
              <p className="text-sm font-bold leading-relaxed whitespace-pre-line">{msg.text}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start mb-4">
            <div className="bg-white p-5 rounded-[2rem] rounded-bl-none flex items-center gap-4 border border-gray-100 shadow-sm animate-pulse">
              <div className="relative">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                {useThinking && <Brain className="w-2.5 h-2.5 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />}
              </div>
              <div>
                <div className="text-xs font-black text-slate-700">{assistantLoadingTitle}</div>
                <div className="mt-1 text-[11px] font-bold text-slate-500">{assistantLoadingText}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-2 rounded-[2rem] border border-gray-200 flex items-center gap-2 shadow-xl focus-within:ring-4 focus-within:ring-purple-50 transition-all">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={tr('اسأل عن السيولة، الأصناف، أو توقعات الأداء...', 'Ask about liquidity, items, or performance forecasts...')}
          className="flex-1 p-4 bg-transparent outline-none text-sm font-bold text-gray-700"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="bg-slate-900 text-white p-4 rounded-2xl hover:bg-black disabled:opacity-30 transition-all shadow-lg active:scale-90"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

const AnalyticsTabButton: React.FC<{
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}> = ({ active, label, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex w-full sm:w-auto justify-center items-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border px-2 py-2 sm:px-4 sm:py-2.5 text-[10px] sm:text-sm font-black transition-all ${active
      ? 'border-violet-200 bg-violet-50 text-violet-700 shadow-sm'
      : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-100 hover:bg-violet-50/60'
      }`}
  >
    {icon}
    {label}
  </button>
);

const AnalyticsMetricCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  tone: 'emerald' | 'rose' | 'violet';
}> = ({ title, value, subtitle, tone }) => {
  const tones = {
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
    violet: 'border-violet-100 bg-violet-50 text-violet-700'
  } as const;

  return (
    <div className={`rounded-[1.1rem] sm:rounded-[1.5rem] border px-3 py-3 sm:px-4 sm:py-4 ${tones[tone]}`}>
      <div className="text-[11px] font-black">{title}</div>
      <div className="mt-1.5 sm:mt-2 text-lg sm:text-xl font-black text-slate-900">{value}</div>
      {subtitle && <div className="mt-1 text-[11px] font-bold text-slate-600">{subtitle}</div>}
    </div>
  );
};

const AnalyticsPanel: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <section className="rounded-[1.2rem] sm:rounded-[1.6rem] border border-slate-200 bg-slate-50/70 p-3 sm:p-4 space-y-2.5 sm:space-y-3">
    <div>
      <div className="text-sm font-black text-slate-900">{title}</div>
      {description && <div className="mt-1 text-[12px] font-bold text-slate-500">{description}</div>}
    </div>
    {children}
  </section>
);

const MetricBarChart: React.FC<{
  items: RankedMetric[];
  emptyLabel: string;
  valueFormatter: (value: number) => string;
  tone: 'emerald' | 'rose' | 'violet';
}> = ({ items, emptyLabel, valueFormatter, tone }) => {
  const maxValue = items.reduce((max, item) => Math.max(max, Math.abs(item.value)), 0);
  const barClass = tone === 'emerald'
    ? 'bg-emerald-500'
    : tone === 'rose'
      ? 'bg-rose-500'
      : 'bg-violet-500';

  if (!items.length) {
    return <div className="text-sm font-bold text-slate-400">{emptyLabel}</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const width = maxValue > 0 ? Math.max(8, (Math.abs(item.value) / maxValue) * 100) : 0;
        return (
          <div key={`${item.label}-${index}`} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-black text-slate-900 truncate">{item.label}</div>
                {item.note && <div className="text-[11px] font-bold text-slate-500 truncate">{item.note}</div>}
              </div>
              <div className={`text-sm font-black ${item.value >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                {valueFormatter(item.value)}
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-white border border-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${barClass}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const StructuredResultCard: React.FC<{
  title: string;
  description?: string;
  icon: React.ReactNode;
  tone: 'violet' | 'emerald' | 'amber';
  items: ResultCardMetric[];
}> = ({ title, description, icon, tone, items }) => {
  const shellTone = tone === 'emerald'
    ? 'border-emerald-100 bg-emerald-50/70'
    : tone === 'amber'
      ? 'border-amber-100 bg-amber-50/70'
      : 'border-violet-100 bg-violet-50/70';
  const iconTone = tone === 'emerald'
    ? 'bg-emerald-100 text-emerald-700'
    : tone === 'amber'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-violet-100 text-violet-700';

  return (
    <section className={`rounded-[1.2rem] sm:rounded-[1.7rem] border p-3 sm:p-4 shadow-sm ${shellTone}`}>
      <div className="flex items-start gap-3">
        <div className={`inline-flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl sm:rounded-2xl ${iconTone}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-black text-slate-900">{title}</div>
          {description && <div className="mt-1 text-[12px] font-bold leading-6 text-slate-600">{description}</div>}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item, index) => {
          const toneClass = item.tone === 'positive'
            ? 'border-emerald-100 bg-white text-emerald-700'
            : item.tone === 'warning'
              ? 'border-amber-100 bg-white text-amber-700'
              : item.tone === 'danger'
                ? 'border-rose-100 bg-white text-rose-700'
                : 'border-slate-100 bg-white text-slate-700';

          return (
            <div key={`${item.label}-${index}`} className={`rounded-[1.2rem] border px-4 py-3 ${toneClass}`}>
              <div className="text-[11px] font-black text-slate-500">{item.label}</div>
              <div className="mt-1 text-sm font-black text-slate-900 leading-6">{item.value}</div>
              {item.hint && <div className="mt-2 text-[11px] font-bold leading-5 text-slate-600">{item.hint}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default AIAssistant;
