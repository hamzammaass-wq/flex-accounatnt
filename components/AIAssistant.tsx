import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useAccounting } from '../contexts/AccountingContext';
import { AlertCircle, Bot, Brain, Globe, Loader2, Mic, Send, Sparkles } from 'lucide-react';
import useResponsiveMode from '../hooks/useResponsiveMode';

type AssistantMessage = {
  role: 'user' | 'model';
  text: string;
  type?: 'thought' | 'search' | 'error';
};

interface AIAssistantProps {
  onOpenVoiceAssistant?: () => void;
}

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
  const { transactions, summary, checks, products, baseCurrency, companySettings } = useAccounting();
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const assistantLanguage = isEnglish ? 'English' : 'Arabic';
  const apiKey = useMemo(() => extractGeminiApiKey(), []);
  const cloudAiEnabled = apiKey.length > 0;

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: 'model',
      text: tr(
        'مرحباً! أنا مساعدك المحاسبي الذكي. كيف يمكنني مساعدتك اليوم؟ يمكنك تفعيل "وضع التفكير" للمسائل المعقدة أو "البحث" للمعلومات المباشرة.',
        'Hello! I am your smart accounting assistant. How can I help today? You can enable Thinking mode for complex cases or Search mode for direct information.'
      )
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [useThinking, setUseThinking] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isTablet } = useResponsiveMode();
  const pendingIncomingChecks = useMemo(
    () => checks.filter(c => c.status === 'PENDING' && c.type === 'INCOMING'),
    [checks]
  );
  const pendingOutgoingChecks = useMemo(
    () => checks.filter(c => c.status === 'PENDING' && c.type === 'OUTGOING'),
    [checks]
  );
  const lowStockItems = useMemo(
    () => products.filter(p => p.stock < 5).sort((a, b) => a.stock - b.stock).slice(0, 5),
    [products]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const buildLocalAssistantReply = (userMessage: string) => {
    const query = userMessage.toLowerCase();
    const formatAmount = (value: number) =>
      new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0));
    const formatQty = (value: number) =>
      new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));

    const stockIntent = /مخزون|الصنف|أصناف|نفاد|stock|inventory|reorder|low/.test(query);
    const checksIntent = /شيك|شيكات|check|checks|تحصيل|سند/.test(query);
    const financeIntent = /رصيد|سيولة|دخل|مصروف|ربح|خسارة|balance|income|expense|cash/.test(query);

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

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
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
        - Low Stock Items: ${products.filter(p => p.stock < 5).length}

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
        You are a senior financial advisor for an ERP app called "Al-Mohaseb Al-Zaki".
        The user language is ${assistantLanguage}.
        Context: ${financialContext}
        User Query: ${userMessage}

        Requirements:
        1. Be professional and concise.
        2. If Thinking mode is ON, show deep analytical reasoning.
        3. If Search mode is ON, provide real-world economic context if relevant.
        4. Format numbers clearly.
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

  return (
    <div
      className="app-page flex flex-col p-4 font-tajawal animate-in fade-in min-h-0"
      style={{ minHeight: 'calc(100dvh - var(--app-safe-top) - var(--app-nav-height) - var(--app-safe-bottom) - 4.75rem)' }}
      dir={isEnglish ? 'ltr' : 'rtl'}
    >
      <header className={`mb-4 flex ${isTablet ? 'items-center gap-4' : 'items-start justify-between gap-2'}`}>
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600" />
            {tr('المساعد الذكي', 'Smart Assistant')}
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
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                {useThinking
                  ? tr('Gemini يفكر بعمق في بياناتك...', 'Gemini is deeply analyzing your data...')
                  : tr('جاري تحليل الأداء المالي...', 'Analyzing financial performance...')}
              </span>
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

export default AIAssistant;
