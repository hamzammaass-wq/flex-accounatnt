# Database Migration Scripts - Company Data Isolation

## Overview

هذه الـ scripts تضيف عمود `company_id` لجميع الجداول الفرعية لضمان عزل كامل لبيانات الشركات على مستوى Schema.

## المشكلة

7 جداول فرعية تفتقد لعمود `company_id` المباشر، مما يسبب:
- عدم إمكانية فلترة البيانات بكفاءة
- اعتماد كامل على JOINs للعزل
- عدم وجود constraints على مستوى قاعدة البيانات
- احتمالية تسرب بيانات عبر الشركات

## الجداول المتأثرة

1. `product_warehouse_stock` - مخزون المنتجات بالمستودعات
2. `invoice_items` - بنود الفواتير
3. `journal_lines` - سطور القيود المحاسبية
4. `stock_transfer_items` - بنود نقل المخزون
5. `employee_contracts` - عقود الموظفين
6. `employee_leave_requests` - طلبات الإجازات
7. `employee_recurring_deductions` - الاستقطاعات الدورية

## ترتيب التنفيذ

### ⚠️ قبل البدء - CRITICAL

```bash
# 1. أخذ backup كامل
pg_dump -U postgres -d smart_account > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. نسخ احتياطية إضافية
pg_dump -U postgres -d smart_account -F c -f backup.dump

# 3. التأكد من المساحة الكافية
df -h /var/lib/postgresql
```

### الخطوة 1: الفحص الأولي

```bash
psql -U postgres -d smart_account -f 000_pre_migration_check.sql
```

**ما يجب فحصه:**
- ✅ عدد السجلات في كل جدول
- ✅ عدم وجود سجلات يتيمة (orphaned records)
- ✅ أن الجداول لا تحتوي على company_id بالفعل
- ✅ الوقت المقدر للتنفيذ

**إذا وُجدت مشاكل:**
- سجلات يتيمة → قم بحذفها أو ربطها بشركة
- company_id موجود بالفعل → لا تنفذ المig migration
- وقت طويل جداً → خطط لـ downtime

### الخطوة 2: تنفيذ Migration

```bash
# في بيئة production - تأكد من وقت منخفض الاستخدام!
psql -U postgres -d smart_account -f 001_add_company_id_to_child_tables.sql
```

**المدة المتوقعة:**
- جداول صغيرة (< 10K rows): 1-2 دقيقة
- جداول متوسطة (10K-100K rows): 3-5 دقائق
- جداول كبيرة (> 100K rows): 5-15 دقيقة

**مراحل التنفيذ:**
1. ✅ إضافة أعمدة (nullable)
2. ✅ ملء البيانات من الجداول الأم
3. ✅ التحقق من عدم وجود NULL values
4. ✅ إضافة NOT NULL constraints
5. ✅ إضافة foreign keys
6. ✅ إنشاء indexes
7. ✅ التحقق النهائي

**إذا فشلت Migration:**
- سيتم ROLLBACK تلقائياً
- راجع الـ error messages
- استعد البيانات من backup إذا لزم الأمر

### الخطوة 3: التحقق بعد Migration

```bash
psql -U postgres -d smart_account -f 002_post_migration_verify.sql
```

**ما يجب التحقق منه:**
- ✅ جميع الأعمدة موجودة و NOT NULL
- ✅ لا توجد قيم NULL
- ✅ Foreign keys موجودة وتعمل
- ✅ Indexes تم إنشاؤها
- ✅ company_id يطابق الجدول الأم
- ✅ العزل بين الشركات يعمل
- ✅ عدد السجلات لم يتغير

**إذا فشل أي فحص:**
- ⛔ لا تعيد تشغيل Backend
- 🔍 راجع المشكلة
- 🔄 استعد من backup إذا لزم الأمر

### الخطوة 4: تحديث الكود

بعد نجاح Migration، يجب تحديث الكود:

```typescript
// ❌ قبل - بدون company_id filter
SELECT pws.* FROM product_warehouse_stock pws
WHERE pws.product_id = $1

// ✅ بعد - مع company_id filter
SELECT pws.* FROM product_warehouse_stock pws
WHERE pws.company_id = $1 AND pws.product_id = $2
```

**الملفات التي تحتاج تحديث:**
- `backend/src/routes/sync.ts` - استعلامات product_warehouse_stock
- `backend/src/routes/reports.ts` - JOINs على journal_lines
- أي ملف يستعلم عن الجداول الفرعية

### الخطوة 5: إعادة تشغيل Backend

```bash
# إعادة تشغيل لتطبيق التغييرات
firebase deploy --only functions
# أو
pm2 restart backend
```

### الخطوة 6: المراقبة

راقب logs لمدة 24 ساعة:
```bash
# Firebase logs
firebase functions:log --only api

# Local logs
tail -f /var/log/backend.log
```

**ابحث عن:**
- ⚠️ Errors متعلقة بـ company_id
- ⚠️ Foreign key violations
- ⚠️ Query performance issues
- ✅ نجاح الاستعلامات

---

## Rollback Plan

إذا حدثت مشاكل بعد Migration:

### السيناريو 1: Migration لم يكتمل (في نفس الجلسة)

```sql
-- إذا كنت لا تزال في psql session
ROLLBACK;
```

### السيناريو 2: Migration اكتمل لكن Backend لا يعمل

```bash
# 1. إيقاف Backend
pm2 stop backend
# أو
firebase functions:delete api

# 2. استعادة Database
psql -U postgres -d smart_account -f backup_YYYYMMDD_HHMMSS.sql

# 3. نشر نسخة قديمة من الكود
git revert HEAD
npm run build
firebase deploy --only functions

# 4. التحقق
curl https://api-74hnz6mpzq-uc.a.run.app/api/health
```

### السيناريو 3: Migration اكتمل لكن البيانات تالفة

```bash
# استعادة كاملة
dropdb smart_account
createdb smart_account
psql -U postgres -d smart_account < backup_YYYYMMDD_HHMMSS.sql
```

---

## Testing

بعد Migration، قم بهذه الاختبارات:

### Test 1: عزل الشركات

```sql
-- إنشاء شركتين للاختبار
INSERT INTO companies (id, name) VALUES ('test_comp1', 'Test Company 1');
INSERT INTO companies (id, name) VALUES ('test_comp2', 'Test Company 2');

-- محاولة استعلام عابر للشركات (يجب أن يعيد 0)
SELECT COUNT(*) FROM journal_lines
WHERE company_id = 'test_comp1'
  AND entry_id IN (SELECT id FROM journal_entries WHERE company_id = 'test_comp2');
```

### Test 2: أداء الاستعلامات

```sql
EXPLAIN ANALYZE
SELECT jl.* FROM journal_lines jl
WHERE jl.company_id = 'your_company_id'
  AND jl.entry_id = 'some_entry_id';

-- يجب أن يستخدم idx_journal_lines_company_entry
```

### Test 3: تكامل البيانات

```typescript
// من API
const response = await fetch('/api/companies/comp1/collections/accounts');
const accounts = await response.json();
// يجب أن يعيد حسابات comp1 فقط
```

---

## FAQ

### Q: هل Migration آمن على production؟
**A**: نعم، إذا:
- أخذت backup كامل
- نفذت pre-check بدون أخطاء
- طبقت في وقت منخفض الاستخدام
- جاهز لـ rollback إذا لزم الأمر

### Q: كم من الوقت سيستغرق؟
**A**: يعتمد على حجم البيانات:
- < 100K rows: 5-10 دقائق
- 100K-1M rows: 10-20 دقيقة
- > 1M rows: 20-30 دقيقة

### Q: هل سيؤثر على الأداء؟
**A**: مؤقتاً نعم أثناء Migration. بعد ذلك:
- ✅ تحسن (indexes جديدة)
- ✅ استعلامات أسرع (فلتر مباشر)

### Q: ماذا لو كانت هناك بيانات يتيمة؟
**A**: Migration سيفشل ويعرض الـ orphans. خياراتك:
1. حذف السجلات اليتيمة
2. ربطها بشركة مناسبة
3. حفظها في جدول archive

### Q: هل يمكن عكس Migration؟
**A**: نعم، لكن:
- ❌ لن يحذف الأعمدة (يحتاج script منفصل)
- ✅ يمكن استعادة من backup
- ⚠️ البيانات الجديدة بعد Migration ستُفقد

---

## Support

إذا واجهت مشاكل:
1. راجع logs: `002_post_migration_verify.sql`
2. تحقق من COMPANY_DATA_FIX.md
3. استعد من backup
4. راسل الدعم الفني

---

**آخر تحديث**: 2026-06-19  
**الحالة**: ✅ جاهز للتنفيذ
