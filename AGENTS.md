# 🤖 دليل وإرشادات الذكاء الاصطناعي مشروع المحاسب فلكس (Smart Accountant)

> **هام لجميع مساعدي الذكاء الاصطناعي (AGENTS / AI ASSISTANTS):**
> يرجى قراءة ملف الملخص المباشر للبرنامج [`PROJECT_SUMMARY.md`](file:///d:/smart%20account/PROJECT_SUMMARY.md) قبل تنفيذ أي تعديل أو تقديم أي استشارة كودية في هذا المشروع.

## 📌 القواعد الذهبية لجميع النماذج:
1. **الالتزام بالأنواع:** لا تقم بتعديل interfaces أو enums في [`types.ts`](file:///d:/smart%20account/types.ts) دون التأكد من تحديث كافة أجزاء الكود المعتمدة عليه.
2. **سياق الحالة المحاسبية:** الكيانات الحسابية والمعاملات المباشرة تعتمد كلياً على المزود [`AccountingContext.tsx`](file:///d:/smart%20account/contexts/AccountingContext.tsx) والمزامنة الحية عبر Firestore [`useFirestoreSyncState.ts`](file:///d:/smart%20account/hooks/useFirestoreSyncState.ts).
3. **التصميم والأيقونات:** يتم تطبيق التصميم بواسطة Vanilla CSS في [`index.css`](file:///d:/smart%20account/index.css) مع استخدام `framer-motion` و `lucide-react`.

لمزيد من التفاصيل المعمارية الهامة، اقرأ [`PROJECT_SUMMARY.md`](file:///d:/smart%20account/PROJECT_SUMMARY.md).
