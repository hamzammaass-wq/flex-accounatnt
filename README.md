# 💼 المحاسب فلكس (Flex Accountant / Smart Accountant)

> **نظام إدارة موارد المؤسسات والمحاسبة المتكامل (ERP & Accounting System)**
> متوافق مع الويب والتطبيقات المحمولة (Web, Android, iOS).

---

## 🌟 نبذة عن البرنامج (Project Description)

**المحاسب فلكس (Flex Accountant / Smart Accountant)** هو نظام محاسبي متكامل وإدارة مؤسسية شامِلة يهدف إلى أتمتة كافة الأنشطة المالية والإدارية والتجارية للمؤسسات والشركات بنظام متعدد المنصات (Cross-Platform).

التطبيق مبني بتقنيات حديثة وعالية السرعة: **React 19 + TypeScript + Vite + Capacitor 8** مع الاعتماد على **Firebase** للمزامنة السحابية وإدارة المستخدمين، إضافةً لتقنيات الذكاء الاصطناعي **Google Gemini AI**.

---

## ✨ الميزات والوحدات الرئيسية (Core Features & Modules)

- **شجرة الحسابات والدفتر العام (General Ledger & Chart of Accounts):** شجرة حسابات هرمية متعددة المستويات، قيد اليومية العامة، والسندات المالية (قبض ودفع).
- **إدارة المبيعات والمشتريات (Sales & Purchases):** إصدار الفواتير، مردودات المبيعات والمشتريات، تسويات العملاء والموردين، والطباعة الحرارية للباركود.
- **إدارة المخزون والمستودعات (Inventory & Warehouses):** كتالوج المنتجات والخدمات، المستودعات المتعددة، الجرد المباشر بماسح الباركود والكاميرا.
- **إدارة الموارد البشرية والرواتب (HR & Payroll):** سجلات الموظفين، الحضور والانصراف (الربط مع أجهزة البصمة)، الرواتب، السلف، والإجازات.
- **الأصول الثابتة وحقوق الملكية (Fixed Assets & Equity):** تتبع أصول الشركة، الإهلاك السنوي التلقائي، وإدارة أرصدة وأرباح الشركاء.
- **البنوك والشيكات والتسويات (Bank Reconciliation & Checks):** مطابقة الحسابات البنكية تلقائياً ومتابعة محفظة الشيكات الصادرة والواردة.
- **التقارير المالية القوائم الختامية (Financial Reports):** ميزان المراجعة، قائمة الدخل، الميزانية العمومية، التقرير الضريبي، ودعم التصدير إلى PDF و Excel.
- **المساعد الذكي والصوتي (AI & Live Voice Assistant):** تحليل مالي ذكي وإجابة على الاستفسارات بواسطة الذكاء الاصطناعي (Gemini API) والتوجيه الصوتي.

---

## 🛠️ البنية التقنية (Tech Stack)

* **Frontend:** React 19, TypeScript, Vite.
* **Mobile Engine:** Capacitor 8 (iOS & Android).
* **Styling & Animation:** Custom Vanilla CSS, Framer Motion, Lucide Icons, Recharts.
* **Database & Cloud:** Firebase Auth, Cloud Firestore, Firebase Hosting, Sql.js (IndexedDB local sync).
* **AI Integration:** `@google/genai` (Google Gemini API).

---

## 🌐 الرابط المباشر (Live Demo)

- **الموقع المباشر على Firebase Hosting:** [https://smart-account-cc181.web.app](https://smart-account-cc181.web.app)

---

## 💻 التشغيل المحلي (Local Development)

1. تثبيت الاعتماديات:
```bash
npm install
```
2. تشغيل سيرفر التطوير المحلي:
```bash
npm run dev
```
3. البناء والتصدير للإنتاج:
```bash
npm run build
```
4. رفع التحديثات إلى Firebase:
```bash
npm run deploy:hosting
```
