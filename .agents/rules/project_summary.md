# 📌 ملخص النظام الشامل - المحاسب فلكس (Smart Accountant)

> **ملاحظة لكافة نماذج الذكاء الاصطناعي (AI Prompt / Context Initialization):**
> هذا المستند يحتوي على الملخص الفني والمعماري الكامل لمشروع **"المحاسب فلكس / Smart Accountant"**. يجب قراءته والاعتماد عليه في أي محادثة جديدة لفهم بنية النظام، التقنيات المستخدمة، مصفوفة الصلاحيات، وإدارة الحالة دون الحاجة لإعادة تحليل المشروع من الصفر.

---

## 🏛️ 1. نظرة عامة على المشروع (Project Overview)
**المحاسب فلكس (Flex Accountant / Smart Accountant)** هو نظام محاسبة وإدارة موارد المؤسسات (ERP) متكامل يعمل عبر الويب والتطبيقات المحمولة (iOS & Android).
يغطي النظام الدورة المحاسبية والإدارية الكاملة:
- شجرة الحسابات والدفتر العام (General Ledger & Chart of Accounts).
- سندات القبض والصرف، المبيعات والمشتريات، وتكلفة المبيعات.
- إدارة المخزون والمستودعات والجرد المباشر بالباركود.
- إدارة الموارد البشرية والرواتب والحضور عبر أجهزة البصمة.
- الأصول الثابتة، حقوق الملكية والشركاء، ومحفظة الشيكات والتسويات البنكية.
- التقارير المالية التفصيلية (ميزان المراجعة، قائمة الدخل، الميزانية العمومية، دفتر الأستاذ).
- المساعد الذكي المدعوم بالذكاء الاصطناعي (Gemini AI) والمساعد الصوتي الفوري.

---

## 🛠️ 2. البنية التقنية (Technology Stack)
* **Frontend:** React 19 + TypeScript + Vite.
* **Mobile Runtime:** Capacitor 8 (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`).
* **Design & Animations:** Custom Vanilla CSS ([`index.css`](file:///d:/smart%20account/index.css)), Framer Motion (`framer-motion`), Lucide Icons (`lucide-react`), Recharts (`recharts`).
* **Backend & Cloud:** Firebase (`firebase` v11) - Auth, Firestore Database, Hosting, Cloud Functions.
* **Local Database & Sync:** Sql.js (`sql.js`), IndexedDB local snapshots, Firestore Realtime Sync ([`useFirestoreSyncState.ts`](file:///d:/smart%20account/hooks/useFirestoreSyncState.ts)).
* **AI Capabilities:** `@google/genai` (Google Gemini API).
* **Subscriptions & Billing:** Paddle JS (`@paddle/paddle-js`).
* **Reporting & Printing:** `jspdf`, `html2canvas`, `jsbarcode`, `html5-qrcode`, `xlsx-js-style`.

---

## 📂 3. الهيكلية الكودية والملفات الرئيسية (Core Files & Architecture)

### 🔹 الملفات المركزية والتكوين:
- [`package.json`](file:///d:/smart%20account/package.json): السكريبتات والاعتماديات الخاصة بالتطوير والنمذجة والموبايل.
- [`App.tsx`](file:///d:/smart%20account/App.tsx): المكون الأساسي لشبكة التوجيه واختبار الصلاحيات والهيكل العام.
- [`index.tsx`](file:///d:/smart%20account/index.tsx): نقطة انطلاق التطبيق وإعداد المزودات (Providers).
- [`types.ts`](file:///d:/smart%20account/types.ts): التعريفات الرئيسية للأنواع والمخططات (Account, Transaction, Invoice, Employee, PermissionMatrix, etc.).
- [`firebaseClient.ts`](file:///d:/smart%20account/firebaseClient.ts): إعداد وتكوين اتصال خدمات Firebase.

### 🔹 إدارة الحالة والمزامنة (State Management):
- [`AccountingContext.tsx`](file:///d:/smart%20account/contexts/AccountingContext.tsx): مزود الحالة المحاسبية الشامل (Global Accounting State)، والذي يدير الحسابات، والمعاملات، والعملات، والقيود التلقائية.
- [`useFirestoreSyncState.ts`](file:///d:/smart%20account/hooks/useFirestoreSyncState.ts): هوك المزامنة الحية بين قاعدة البيانات المحلية والسحابية (Offline-First Architecture).

### 🔹 الوحدات والمكونات الرئيسية (Modules & Components):
1. **الحسابات والقيود:**
   - [`AccountsTree.tsx`](file:///d:/smart%20account/components/AccountsTree.tsx): شجرة الحسابات الهرمية.
   - [`JournalManager.tsx`](file:///d:/smart%20account/components/JournalManager.tsx): قيود اليومية العامة.
   - [`TransactionForm.tsx`](file:///d:/smart%20account/components/TransactionForm.tsx): نموذج المعاملات المالية المتقدم.
   - [`VoucherManager.tsx`](file:///d:/smart%20account/components/VoucherManager.tsx): إدارة سندات القبض والصرف.
   - [`CurrencyManager.tsx`](file:///d:/smart%20account/components/CurrencyManager.tsx): إدارة متعدد العملات وأسعار الصرف.

2. **المبيعات والمشتريات والمخازن:**
   - [`SalesInvoiceList.tsx`](file:///d:/smart%20account/components/SalesInvoiceList.tsx): فواتير المبيعات وتسويات العملاء.
   - [`PurchaseInvoiceList.tsx`](file:///d:/smart%20account/components/PurchaseInvoiceList.tsx): فواتير المشتريات والموردين.
   - [`ProductList.tsx`](file:///d:/smart%20account/components/ProductList.tsx): كتالوج المنتجات والخدمات والتسعير.
   - [`WarehouseManager.tsx`](file:///d:/smart%20account/components/WarehouseManager.tsx): المستودعات والتحويلات المخزنية.
   - [`BarcodeStockTakeManager.tsx`](file:///d:/smart%20account/components/BarcodeStockTakeManager.tsx): الجرد بالمخازن وعبر الكاميرا/الباركود.

3. **الموارد البشرية والبنوك والأصول:**
   - [`HRManager.tsx`](file:///d:/smart%20account/components/HRManager.tsx): الموظفين، الرواتب، السلف والإجازات.
   - [`FingerprintReadersManager.tsx`](file:///d:/smart%20account/components/FingerprintReadersManager.tsx): ربط أجهزة البصمة للحضور والانصراف.
   - [`BankReconciliationManager.tsx`](file:///d:/smart%20account/components/BankReconciliationManager.tsx): مطابقة الحسابات البنكية أوتوماتيكياً.
   - [`CheckPortfolio.tsx`](file:///d:/smart%20account/components/CheckPortfolio.tsx): إدارة حركة وتظهير الشيكات.
   - [`FixedAssetsManager.tsx`](file:///d:/smart%20account/components/FixedAssetsManager.tsx): الأصول الثابتة وحساب الإهلاك.
   - [`EquityPartnersManager.tsx`](file:///d:/smart%20account/components/EquityPartnersManager.tsx): حقوق الملكية وأرباح الشركاء.

4. **التقارير والطباعة والذكاء الاصطناعي:**
   - [`FinancialReports.tsx`](file:///d:/smart%20account/components/FinancialReports.tsx): التقارير المالية والقوائم الختامية.
   - [`documentExport.ts`](file:///d:/smart%20account/utils/documentExport.ts): تصدير التقارير والفواتير (PDF, Excel, Thermal Printer).
   - [`AIAssistant.tsx`](file:///d:/smart%20account/components/AIAssistant.tsx): المساعد المحاسبي الذكي عبر Gemini AI.
   - [`LiveVoiceAssistant.tsx`](file:///d:/smart%20account/components/LiveVoiceAssistant.tsx): المساعد الصوتي التفاعلي المباشر.

---

## ⚡ 4. أوامر التشغيل والبناء (Commands)
- **التشغيل المحلي:** `npm run dev` (يملأ المنفذ المحلي 3000).
- **الفحص والاختبارات:** `npm run test` (بواسطة Vitest) / `npm run ci:verify`.
- **بناء الويب:** `npm run build`.
- **بناء الأندرويد:** `npm run android:apk` أو `npm run android:release`.
- **مزامنة الموبايل (Capacitor):** `npm run cap:sync`.

---

> 💡 **إرشادات للذكاء الاصطناعي في الجلسات القادمة:**
> عند البدء في أي مهمة جديدة على هذا المشروع، يرجى الرجوع لهذا المستند لمعرفة الجزء الخاص بالفكرة أو الموديل وتجنب إحداث أي تغييرات تكسر العقود في [`types.ts`](file:///d:/smart%20account/types.ts) أو الخلل في تزامن [`AccountingContext.tsx`](file:///d:/smart%20account/contexts/AccountingContext.tsx).
