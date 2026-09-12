import React from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, FileText, Printer } from 'lucide-react';

type PolicyMode = 'POLICY' | 'USAGE_GUIDE';

interface PolicyGuideScreenProps {
  mode: PolicyMode;
  language: 'AR' | 'EN';
  onBack: () => void;
}

type GuideItem = {
  ar: string;
  en: string;
};

type GuideSection = {
  headingAr: string;
  headingEn: string;
  items: GuideItem[];
  detailsAr?: string;
  detailsEn?: string;
};

type GuideContent = {
  titleAr: string;
  titleEn: string;
  introAr: string;
  introEn: string;
  badgeAr: string;
  badgeEn: string;
  highlights: GuideItem[];
  sections: GuideSection[];
};

const CONTENT: Record<PolicyMode, GuideContent> = {
  POLICY: {
    titleAr: 'سياسة الاستخدام وخصوصية البيانات',
    titleEn: 'Usage Policy and Privacy',
    introAr: 'باستخدامك للنظام فأنت توافق على إدارة بيانات شركتك داخل مساحة العمل الخاصة بك وفق الصلاحيات والإعدادات التي تضبطها.',
    introEn: 'By using the system, you agree to manage your company data inside your workspace according to the permissions and settings you configure.',
    badgeAr: 'السياسات',
    badgeEn: 'Policy',
    highlights: [
      { ar: 'البيانات المالية تبقى ضمن مساحة عمل الشركة.', en: 'Financial data stays inside the company workspace.' },
      { ar: 'صلاحيات المستخدمين تحدد ما يمكن عرضه أو تعديله أو ترحيله.', en: 'User permissions control viewing, editing, posting, and printing.' },
      { ar: 'المستخدم مسؤول عن دقة البيانات قبل الترحيل والطباعة.', en: 'The user is responsible for reviewing data before posting and printing.' }
    ],
    sections: [
      {
        headingAr: 'نطاق الخدمة',
        headingEn: 'Service Scope',
        items: [
          { ar: 'يوفر النظام أدوات لإدارة الحسابات، الفواتير، السندات، المخزون، التقارير، والعمليات اليومية.', en: 'The system provides tools for accounts, invoices, vouchers, inventory, reports, and daily operations.' },
          { ar: 'يتم إنشاء شركة افتراضية عند بدء الاستخدام، ويمكن إدارة أكثر من شركة حسب الاشتراك والصلاحيات.', en: 'A default company can be created on first use, and multiple companies can be managed according to the subscription and permissions.' },
          { ar: 'البرنامج مخصص لإدارة الأعمال والبيانات المالية الداخلية، ولا يغني عن مراجعة المحاسب أو المستشار القانوني عند الحاجة.', en: 'The app is intended for internal business and financial management and does not replace accountant or legal review when needed.' }
        ]
      },
      {
        headingAr: 'البيانات والمحتوى',
        headingEn: 'Data and Content',
        items: [
          { ar: 'أدخل بيانات صحيحة للعملاء والموردين والأصناف والحسابات قبل إصدار الفواتير أو السندات.', en: 'Enter accurate customers, suppliers, items, and accounts before issuing invoices or vouchers.' },
          { ar: 'استخدم النسخ الاحتياطي بانتظام لحماية بياناتك من فقدان الجهاز أو أخطاء التشغيل.', en: 'Use backup regularly to protect your data from device loss or operational mistakes.' },
          { ar: 'حذف الحساب أو البيانات يتم من إعدادات النظام، ويجب تنفيذه فقط بعد التأكد من وجود نسخة احتياطية.', en: 'Account or data deletion is available from system settings and should be done only after confirming a backup exists.' }
        ]
      },
      {
        headingAr: 'المسؤولية والصلاحيات',
        headingEn: 'Responsibility and Permissions',
        items: [
          { ar: 'حافظ على كلمة المرور ولا تشارك حساب المدير مع مستخدمين غير مخولين.', en: 'Protect your password and do not share the administrator account with unauthorized users.' },
          { ar: 'امنح صلاحيات الحذف والترحيل والطباعة للمستخدمين الموثوقين فقط.', en: 'Grant delete, posting, and printing permissions only to trusted users.' },
          { ar: 'راجع الفواتير والسندات قبل الترحيل لأن الحركات المرحلة تؤثر مباشرة على التقارير والأرصدة.', en: 'Review invoices and vouchers before posting because posted entries directly affect reports and balances.' }
        ]
      }
    ]
  },
  USAGE_GUIDE: {
    titleAr: 'طريقة استخدام برنامج المحاسب فلكس',
    titleEn: 'How to Use Flex Accountant',
    introAr: 'هذا الدليل يرتب خطوات العمل من أول تشغيل وحتى إصدار التقارير. اتبع الأقسام بالترتيب عند تجهيز شركة جديدة، أو افتح القسم المناسب عند الحاجة.',
    introEn: 'This guide organizes the workflow from first setup to reports. Follow the sections in order for a new company, or open the relevant section when needed.',
    badgeAr: 'دليل عملي',
    badgeEn: 'Practical Guide',
    highlights: [
      { ar: 'ابدأ من النظام لإعداد الشركة والعملة والضرائب.', en: 'Start from System to configure company, currency, and taxes.' },
      { ar: 'جهز الحسابات والأرصدة الافتتاحية قبل الترحيل.', en: 'Prepare accounts and opening balances before posting.' },
      { ar: 'بعد كل عملية راجع التقارير للتأكد من الأرصدة.', en: 'After each workflow, review reports to confirm balances.' }
    ],
    sections: [
      {
        headingAr: '1. البداية السريعة',
        headingEn: '1. Quick Start',
        items: [
          { ar: 'افتح النظام ثم ادخل إلى النظام من الشريط السفلي، وبعدها ابدأ من بيانات الشركة.', en: 'Open the app, go to System from the bottom bar, then start with Company Data.' },
          { ar: 'أدخل اسم الشركة، الرقم الضريبي، العنوان، الشعار، واللغة المناسبة.', en: 'Enter company name, tax number, address, logo, and preferred language.' },
          { ar: 'حدد العملة الأساسية ونسبة الضريبة وخيارات الطباعة قبل إصدار أول فاتورة.', en: 'Set the base currency, tax rate, and print options before creating the first invoice.' },
          { ar: 'فعّل النسخ الاحتياطي من البداية حتى تكون بيانات الشركة محفوظة.', en: 'Enable backup from the start so the company data remains protected.' }
        ]
      },
      {
        headingAr: '2. تجهيز الحسابات والخزائن',
        headingEn: '2. Prepare Accounts and Treasury',
        items: [
          { ar: 'من النظام افتح دليل الحسابات وتأكد من وجود حسابات النقدية، البنوك، العملاء، الموردين، المبيعات، والمشتريات.', en: 'From System, open Chart of Accounts and confirm cash, banks, customers, suppliers, sales, and purchases accounts exist.' },
          { ar: 'من شاشة النقدية والبنوك أضف الصناديق والحسابات البنكية التي تستخدمها يوميا.', en: 'From Treasury, add the cash boxes and bank accounts you use daily.' },
          { ar: 'استخدم الأرصدة الافتتاحية لإدخال أرصدة بداية العمل للعملاء والموردين والحسابات.', en: 'Use Opening Balances to enter starting balances for customers, suppliers, and accounts.' },
          { ar: 'لا تبدأ الترحيل اليومي قبل التأكد من الحسابات الأساسية حتى لا تظهر تقارير ناقصة.', en: 'Do not start daily posting before checking core accounts so reports do not appear incomplete.' }
        ]
      },
      {
        headingAr: '3. الأصناف والمخازن',
        headingEn: '3. Items and Warehouses',
        items: [
          { ar: 'افتح المخزون لإضافة الأصناف، وحدد هل الصنف مخزني أم خدمة.', en: 'Open Inventory to add items and choose whether each item is stock-based or a service.' },
          { ar: 'أدخل كود الصنف أو الباركود، سعر الشراء، سعر البيع، الوحدة، وحد التنبيه للكمية.', en: 'Enter item code or barcode, purchase price, sale price, unit, and low-stock alert quantity.' },
          { ar: 'من النظام يمكنك إضافة الوحدات ومجموعات الأصناف لتسهيل التصنيف والبحث.', en: 'From System, add units and item groups to make classification and search easier.' },
          { ar: 'إذا كان لديك أكثر من مستودع، أضف المستودعات ثم استخدم التحويلات المخزنية عند نقل البضاعة.', en: 'If you have multiple warehouses, add them and use stock transfers when moving goods.' }
        ]
      },
      {
        headingAr: '4. فاتورة المبيعات',
        headingEn: '4. Sales Invoice',
        items: [
          { ar: 'افتح المبيعات واضغط زر الإضافة لإنشاء فاتورة جديدة.', en: 'Open Sales and press the add button to create a new invoice.' },
          { ar: 'اختر العميل وطريقة الدفع: نقدي عند قبض المبلغ مباشرة، أو آجل عند بقاء ذمة على العميل.', en: 'Choose the customer and payment method: cash for immediate payment, or credit when the customer owes a balance.' },
          { ar: 'أضف الأصناف بالبحث أو الباركود أو بند يدوي، ثم عدل الكمية والسعر عند الحاجة.', en: 'Add items by search, barcode, or manual line, then adjust quantity and price when needed.' },
          { ar: 'راجع الخصم الإضافي والضريبة والصافي النهائي قبل الضغط على ترحيل واعتماد الفاتورة.', en: 'Review extra discount, tax, and final net before pressing Post and approve invoice.' },
          { ar: 'بعد الترحيل يمكنك الطباعة أو الرجوع لقائمة الفواتير ومراجعة أثرها على التقارير.', en: 'After posting, you can print or return to the invoice list and review its effect on reports.' }
        ]
      },
      {
        headingAr: '5. المشتريات والمصاريف',
        headingEn: '5. Purchases and Expenses',
        items: [
          { ar: 'افتح المشتريات لإدخال فواتير الموردين وتحديث تكلفة الأصناف والمخزون.', en: 'Open Purchases to enter supplier invoices and update item cost and stock.' },
          { ar: 'استخدم مشتريات نقدية عند الدفع مباشرة، أو مشتريات آجلة عند تسجيل ذمة على المورد.', en: 'Use cash purchases for immediate payment, or credit purchases when a supplier balance remains.' },
          { ar: 'سجل المصاريف من شاشة المشتريات والمصاريف عند وجود مصروف بدون أصناف مخزنية.', en: 'Record expenses from Purchases and Expenses when the transaction has no inventory items.' },
          { ar: 'استخدم مصاريف الاستيراد لتوزيع الشحن والجمارك والمصاريف الإضافية على تكلفة الأصناف.', en: 'Use import expenses to distribute shipping, customs, and additional charges to item cost.' }
        ]
      },
      {
        headingAr: '6. سندات القبض والصرف والقيود',
        headingEn: '6. Receipts, Payments, and Journal Entries',
        items: [
          { ar: 'استخدم سند قبض عند استلام مبلغ من عميل أو أي جهة أخرى.', en: 'Use a receipt voucher when receiving money from a customer or another party.' },
          { ar: 'استخدم سند صرف عند دفع مبلغ لمورد أو مصروف أو أي جهة أخرى.', en: 'Use a payment voucher when paying a supplier, expense, or another party.' },
          { ar: 'اربط السند بالفاتورة عند السداد حتى تظهر الفاتورة مسددة في كشف العميل أو المورد.', en: 'Allocate the voucher to the invoice so the invoice appears settled in customer or supplier statements.' },
          { ar: 'استخدم القيد اليدوي للحركات المحاسبية التي لا تغطيها الفواتير والسندات، مع التأكد من تساوي المدين والدائن.', en: 'Use manual journal entries for accounting movements not covered by invoices or vouchers, making sure debit equals credit.' }
        ]
      },
      {
        headingAr: '7. العملاء والموردون وكشوف الحساب',
        headingEn: '7. Customers, Suppliers, and Statements',
        items: [
          { ar: 'افتح الدليل لإضافة العملاء والموردين وربط كل جهة بحسابها المحاسبي.', en: 'Open Directory to add customers and suppliers and link each contact to its account.' },
          { ar: 'من كشف الحساب يمكنك متابعة الفواتير والسندات والرصيد الجاري لكل جهة.', en: 'From the statement, track invoices, vouchers, and running balance for each contact.' },
          { ar: 'استخدم التسويات عند الحاجة لمطابقة أرصدة العملاء أو الموردين مع الواقع.', en: 'Use settlements when you need to adjust customer or supplier balances to match reality.' },
          { ar: 'قبل طباعة كشف الحساب راجع التاريخ والعملة وخيارات ترتيب الحركات.', en: 'Before printing a statement, review date range, currency, and transaction order options.' }
        ]
      },
      {
        headingAr: '8. التقارير والمتابعة',
        headingEn: '8. Reports and Follow-up',
        items: [
          { ar: 'افتح التقارير لمراجعة ميزان المراجعة، قائمة الدخل، الميزانية، ودفتر الأستاذ.', en: 'Open Reports to review Trial Balance, Income Statement, Balance Sheet, and Ledger.' },
          { ar: 'استخدم فلاتر التاريخ والحسابات للحصول على تقرير محدد للفترة المطلوبة.', en: 'Use date and account filters to get reports for the required period.' },
          { ar: 'راجع التقارير بعد إدخال الفواتير والسندات للتأكد من صحة الأرصدة.', en: 'Review reports after entering invoices and vouchers to confirm balances.' },
          { ar: 'يمكنك طباعة التقارير أو تصديرها حسب الخيارات المتاحة في كل شاشة.', en: 'You can print or export reports according to the options available on each screen.' }
        ]
      },
      {
        headingAr: '9. الموظفون والأصول والشيكات',
        headingEn: '9. HR, Assets, and Checks',
        items: [
          { ar: 'من الموظفين أضف بيانات العاملين والرواتب والحضور والإجازات حسب حاجة الشركة.', en: 'From HR, add employees, payroll, attendance, and leaves as needed.' },
          { ar: 'من الأصول سجل الأصول الثابتة وتابع الإهلاك الدوري.', en: 'From Assets, record fixed assets and track periodic depreciation.' },
          { ar: 'من الشيكات تابع الشيكات الواردة والصادرة ومواعيد الاستحقاق.', en: 'From Checks, track incoming and outgoing checks and due dates.' },
          { ar: 'استخدم التنبيهات لمتابعة الشيكات المستحقة ونواقص المخزون وتواريخ الصلاحية.', en: 'Use alerts to follow due checks, low stock, and expiry dates.' }
        ]
      },
      {
        headingAr: '10. الأمان والنسخ الاحتياطي والصلاحيات',
        headingEn: '10. Security, Backup, and Permissions',
        items: [
          { ar: 'فعّل النسخ الاحتياطي اليدوي أو التلقائي من النظام، واحتفظ بنسخة قبل أي تعديل كبير.', en: 'Enable manual or automatic backup from System and keep a backup before major changes.' },
          { ar: 'أنشئ مستخدمين منفصلين ولا تستخدم حساب المدير للموظفين اليوميين.', en: 'Create separate users and avoid using the admin account for daily employees.' },
          { ar: 'اضبط الصلاحيات حسب عمل كل مستخدم: عرض، إضافة، تعديل، حذف، ترحيل، طباعة.', en: 'Set permissions according to each user role: view, add, edit, delete, post, and print.' },
          { ar: 'استخدم فحص سلامة البيانات إذا لاحظت فرقًا في الأرصدة أو التقارير.', en: 'Use Integrity Check if you notice differences in balances or reports.' }
        ],
        detailsAr: 'أفضل تسلسل للعمل اليومي: أدخل العملية، راجع الصافي والحسابات، رحل، ثم راجع التقرير أو كشف الحساب.',
        detailsEn: 'Recommended daily flow: enter the transaction, review totals and accounts, post it, then review the report or statement.'
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
  const badge = isArabic ? content.badgeAr : content.badgeEn;
  const PageIcon = mode === 'USAGE_GUIDE' ? BookOpen : FileText;

  return (
    <div
      className="min-h-dvh bg-slate-100 p-3 text-slate-900 sm:p-6"
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className={`h-3.5 w-3.5 ${isArabic ? 'rotate-180' : ''}`} />
            {isArabic ? 'العودة' : 'Back'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" />
            {isArabic ? 'طباعة' : 'Print'}
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          <div className="rounded-2xl bg-slate-950 p-5 text-white sm:p-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-black text-slate-200">
              <PageIcon className="h-4 w-4" />
              {badge}
            </div>
            <h1 className="text-xl font-black leading-tight sm:text-2xl">{title}</h1>
            <p className="mt-3 max-w-3xl text-sm font-bold leading-7 text-slate-300">{intro}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {content.highlights.map((highlight, index) => (
              <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <p className="text-xs font-black leading-6 text-slate-700">
                  {isArabic ? highlight.ar : highlight.en}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3">
            {content.sections.map((section, sectionIndex) => {
              const heading = isArabic ? section.headingAr : section.headingEn;
              const details = isArabic ? section.detailsAr : section.detailsEn;
              return (
                <section key={heading} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-black text-white">
                      {sectionIndex + 1}
                    </span>
                    <h2 className="text-sm font-black text-slate-900">{heading}</h2>
                  </div>
                  <ol className="space-y-2">
                    {section.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold leading-7 text-slate-700">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{isArabic ? item.ar : item.en}</span>
                      </li>
                    ))}
                  </ol>
                  {details ? (
                    <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-black leading-6 text-amber-800">
                      {details}
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PolicyGuideScreen;
