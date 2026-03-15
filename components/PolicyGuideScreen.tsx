import React from 'react';
import { ArrowLeft } from 'lucide-react';

type PolicyMode = 'POLICY' | 'USAGE_GUIDE';

interface PolicyGuideScreenProps {
  mode: PolicyMode;
  language: 'AR' | 'EN';
  onBack: () => void;
}

const CONTENT: Record<
  PolicyMode,
  {
    titleAr: string;
    titleEn: string;
    introAr: string;
    introEn: string;
    sections: Array<{
      headingAr: string;
      headingEn: string;
      items: string[];
      detailsAr?: string;
      detailsEn?: string;
    }>;
  }
> = {
  POLICY: {
    titleAr: 'سياسة الاستخدام وخصوصية البيانات',
    titleEn: 'Usage Policy and Privacy',
    introAr: 'مرحبًا بك في النظام. باستخدام حسابك أنت توافق على الشروط والسياسات التالية.',
    introEn: 'Welcome. By using your account, you accept the following policies.',
    sections: [
      {
        headingAr: '1) نطاق الخدمة',
        headingEn: '1) Service scope',
        items: [
          'يوفّر النظام أدوات إدارة محاسبية تشغيلية وإصدار تقارير وإيصالات.',
          'يتم تهيئة شركة واحدة بشكل تلقائي بعد إنشاء الحساب ويمكنك إضافة شركات لاحقًا حسب الاشتراك.',
          'تطبيق الشروط يخص جميع المستخدمين داخل هذا الحساب.'
        ],
        detailsAr: 'يستخدم التطبيق في إدارة البيانات المالية الخاصة بالمؤسسة فقط.',
        detailsEn: 'The app is intended for internal business financial management only.'
      },
      {
        headingAr: '2) البيانات والمحتوى',
        headingEn: '2) Data and content',
        items: [
          'تُحفظ بياناتك محليًا ضمن مساحة العمل مع مزامنة احتياطية حسب إعدادات النسخ الاحتياطي.',
          'تلتزم الشركة بعدم مشاركة أي بيانات جهات غير مصرح بها ضمن نفس المؤسسة.',
          'يمكنك حذف البيانات من إعدادات النسخ الاحتياطي أو طلب الإغلاق يدويًا.'
        ],
        detailsAr: 'البيانات الحساسة (الفواتير، العملاء، الحركات) يجب إدارتها من حساب مسؤول.',
        detailsEn: 'Sensitive data (invoices, customers, transactions) should be managed by an admin account.'
      },
      {
        headingAr: '3) المسؤولية',
        headingEn: '3) Responsibility',
        items: [
          'أنت مسؤول عن حفظ كلمة المرور والاعتمادات المرتبطة بحسابك.',
          'أي عملية مالية/قانونية يتم حفظها في النظام تظل مسؤولية مالك الحساب.',
          'لا يتحمل المطور ضررًا ناجمًا عن إدخال بيانات غير دقيقة.'
        ]
      }
    ]
  },
  USAGE_GUIDE: {
    titleAr: 'دليل الاستخدام السريع',
    titleEn: 'Quick Usage Guide',
    introAr: 'اتبع الخطوات التالية للبدء بأقل وقت.',
    introEn: 'Use these steps to start quickly.',
    sections: [
      {
        headingAr: '1) بعد التسجيل',
        headingEn: '1) After registration',
        items: [
          'اختر عملة النظام الأساسية المناسبة لشركتك.',
        'فعّل عرض الضريبة إن كانت فواتيرك تتضمن ضرائب صريحة.',
        'فعّل وضع الباركود إذا كنت تحتاج قراءة وإضافة أصناف بسرعة.'
        ]
      },
      {
        headingAr: '2) أول المعاملات',
        headingEn: '2) First transactions',
        items: [
          'أضف الأصناف والأسعار الأساسية للعملاء والموردين.',
          'سجّل أول فاتورة/سند تجريبي وتحقق من طباعة التقرير.',
          'فعّل النسخ الاحتياطي قبل إدخال بيانات إنتاجية كبيرة.'
        ],
        detailsAr: 'يمكنك تعديل الإعدادات اللاحقة من شاشة الإعدادات في أي وقت.',
        detailsEn: 'Settings can be changed later from Settings screen at any time.'
      },
      {
        headingAr: '3) الدعم والتطوير',
        headingEn: '3) Support and growth',
        items: [
          'استخدم الإشعارات والتنبيهات لمتابعة انتهاء الاشتراك.',
          'إذا واجهت مشكلة، راجع سجل المراجعة أو أعد تحميل الصفحة.',
          'يمكنك طلب ربط إضافي عبر شاشة الإعدادات.'
        ]
      }
    ]
  }
};

const PolicyGuideScreen: React.FC<PolicyGuideScreenProps> = ({
  mode,
  language,
  onBack
}) => {
  const isArabic = language === 'AR';
  const content = CONTENT[mode];
  const title = isArabic ? content.titleAr : content.titleEn;
  const intro = isArabic ? content.introAr : content.introEn;

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-900 p-4 sm:p-6 flex items-start justify-center">
      <div className="w-full max-w-4xl bg-white rounded-2xl border border-slate-200 shadow-xl">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black border border-slate-200 hover:bg-slate-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {isArabic ? 'العودة' : 'Back'}
          </button>
          <div className="text-xs font-black text-slate-400">{isArabic ? 'النسخة القانونية' : 'Legal section'}</div>
        </div>
        <div className="p-5 space-y-4">
          <h1 className="text-xl font-black text-slate-900">{title}</h1>
          <p className="text-sm text-slate-600 leading-7">{intro}</p>

          {content.sections.map((section) => {
            const heading = isArabic ? section.headingAr : section.headingEn;
            const details = isArabic ? section.detailsAr : section.detailsEn;
            return (
              <section key={heading} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <h2 className="text-sm font-black mb-3 text-slate-800">{heading}</h2>
                <ul className="text-sm leading-7 text-slate-700 space-y-1">
                  {section.items.map((item) => <li key={item}>• {item}</li>)}
                </ul>
                {details ? <p className="text-xs text-slate-500 mt-3">{details}</p> : null}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PolicyGuideScreen;

