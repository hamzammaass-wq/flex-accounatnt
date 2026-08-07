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
          'يمكنك حذف حساب الدخول من الإعدادات > حذف الحساب، أو استخدام صفحة حذف الحساب العامة إذا احتجت ذلك.'
        ],
        detailsAr: 'البيانات الحساسة (الفواتير، العملاء، الحركات) يجب إدارتها من حساب مسؤول.',
        detailsEn: 'Sensitive data (invoices, customers, transactions) should be managed by an admin account. Sign-in account deletion is available from Settings > Delete Account.'
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
    titleAr: 'الدليل الشامل لاستخدام المحاسب فلكس',
    titleEn: 'Comprehensive User Guide for Flex Accountant',
    introAr: 'أهلاً بك في الدليل الشامل. يوفر هذا الدليل شرحاً مفصلاً لكافة أقسام النظام لتحقيق أقصى استفادة.',
    introEn: 'Welcome to the comprehensive guide. This provides detailed explanations of all system modules.',
    sections: [
      {
        headingAr: '1) إعدادات النظام والشركة',
        headingEn: '1) System & Company Settings',
        items: [
          'ملف الشركة: أدخل اسم الشركة، الرقم الضريبي، والعنوان من الإعدادات.',
          'الطباعة: تخصيص الفواتير الإلكترونية (QR Code) والملاحظات السفلية.',
          'التنبيهات: تفعيل تنبيهات نواقص المخزون وانتهاء الصلاحية.',
          'السنة المالية: تفعيل خيار إغلاق السنة المالية لتوليد قيود الإقفال.'
        ]
      },
      {
        headingAr: '2) الحسابات والإدارة المالية',
        headingEn: '2) Accounts & Financial Management',
        items: [
          'إضافة حساب: تعريف أصول، خصوم، إيرادات ومصروفات مع تحديد العملة.',
          'السندات والقيود: تسجيل سندات القبض والصرف، والقيود المحاسبية اليدوية.',
          'العملات: تحديث أسعار الصرف للتعامل متعدد العملات بدقة.',
          'مطابقة البنك: لمطابقة حركات النظام مع كشف الحساب البنكي الفعلي.'
        ]
      },
      {
        headingAr: '3) المخازن والأصناف',
        headingEn: '3) Warehouses & Inventory',
        items: [
          'المخازن: تعريف مستودعات متعددة ونقل البضائع عبر التحويلات المخزنية.',
          'الأصناف: إضافة منتجات (مخزنية/خدمية) بوحدات قياس متعددة وأسعار مختلفة.',
          'التسعير والتواريخ: إعداد حد النواقص وتواريخ الصلاحية والتسعير التلقائي.'
        ]
      },
      {
        headingAr: '4) المبيعات والمشتريات',
        headingEn: '4) Sales & Purchases',
        items: [
          'الفواتير: إنشاء فواتير المبيعات والمشتريات وإضافة الأصناف باستخدام الباركود.',
          'الضرائب والخصومات: تطبيق ضريبة القيمة المضافة وخصومات الفواتير بسهولة.',
          'مصاريف الاستيراد: توزيع تكاليف الجمارك والشحن على الأصناف للوصول للتكلفة الحقيقية.'
        ]
      },
      {
        headingAr: '5) الموارد البشرية والرواتب (HR)',
        headingEn: '5) HR & Payroll',
        items: [
          'الموظفون: إضافة عقود (راتب ثابت أو بالساعة) وإدارة البدلات.',
          'الحضور: ربط أجهزة البصمة واستيراد سجلات الدخول والخروج آلياً.',
          'الطلبات: إدارة الإجازات وتسجيل الخصومات المتكررة مثل السلف والتأمين.',
          'مسير الرواتب: إصدار الرواتب بضغطة زر واحدة لتوليد قيود الرواتب.'
        ]
      },
      {
        headingAr: '6) الأصول والتقارير',
        headingEn: '6) Fixed Assets & Reports',
        items: [
          'الأصول الثابتة: تسجيل الأصول واحتساب الإهلاك الدوري آلياً.',
          'لوحة القيادة: رسوم بيانية توضح إجمالي الدخل والمصروفات.',
          'كشوفات الحساب والتقارير المحاسبية: ميزان المراجعة والميزانية العمومية.'
        ]
      },
      {
        headingAr: '7) إدارة المستخدمين والصلاحيات',
        headingEn: '7) Users & Permissions',
        items: [
          'تخصيص الصلاحيات: السماح بـ (عرض، إضافة، تعديل، حذف، ترحيل، طباعة) لكل شاشة.',
          'احرص على منح صلاحيات الترحيل والحذف للمحاسبين الموثوقين فقط لحماية البيانات.'
        ]
      },
      {
        headingAr: '8) النسخ الاحتياطي',
        headingEn: '8) Backup & Security',
        items: [
          'النسخ التلقائي: تفعيل أخذ نسخ يومية أو فورية.',
          'Google Drive: ربط الحساب لرفع النسخ المشفرة سحابياً بشكل آمن.'
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

