# إصلاح مشكلة انهيار الصفحة بعد ثواني

## المشكلة
كانت الصفحة تنهار (crash) بعد ثواني من التشغيل بسبب:
1. حلقة لا نهائية من إعادة الرندر (infinite render loop)
2. مشكلة في useEffect dependencies في AccountingContext
3. تحديثات state مفرطة تسبب إرهاق المتصفح

## الحلول المطبقة

### 1. إصلاح AccountingContext.tsx
- **إزالة workspaceSubscription من dependencies**: كان يسبب إعادة تشغيل useEffect بشكل لا نهائي
- **إضافة نظام كشف infinite loops**: يتتبع عدد مرات الرندر ويوقف التطبيق قبل crash المتصفح
- **تحسين setCompanies**: منع تحديثات state غير ضرورية

```typescript
// قبل: كان workspaceSubscription يسبب مشكلة
}, [currentUser, firebaseDb, isAuthInitialized, workspaceSubscription]);

// بعد: إزالة workspaceSubscription
}, [currentUser, firebaseDb, isAuthInitialized]);
```

### 2. إصلاح useFirestoreSyncState.ts
- **إضافة throttling للـ snapshots**: منع معالجة تحديثات متتالية سريعة جداً
- **تحديد فاصل زمني أدنى**: 100ms بين updates
- **throttling لتحديثات dataRef**: منع تحديثات ref مفرطة

```typescript
const MIN_UPDATE_INTERVAL = 100; // ms
if (now - lastSnapshotTime < MIN_UPDATE_INTERVAL && !snapshot.metadata.hasPendingWrites) {
  console.log(`[Sync Throttle] Skipping rapid update`);
  return;
}
```

### 3. إضافة حماية في App.tsx
- **نظام كشف re-renders مفرطة**: يوقف التطبيق إذا تجاوز 100 render في ثانيتين
- **رسائل واضحة للمطورين**: تساعد في تتبع المشكلة

### 4. تحسين index.html
- **تقليل timeout**: من 30 ثانية إلى 15 ثانية
- **فحص دوري**: كل ثانية للتحقق من وجود محتوى
- **استعادة أسرع**: عند عدم وجود محتوى

### 5. إضافة حماية ضد infinite reload loops في index.tsx
- **تتبع عدد مرات الـ crash**: يمنع إعادة التحميل اللانهائية
- **رسالة خطأ واضحة**: بعد 3 crashes متتالية في دقيقة واحدة
- **إرشادات للمستخدم**: خطوات واضحة لحل المشكلة

## الأداء المتوقع بعد الإصلاح

✅ **قبل**: الصفحة تنهار بعد 3-10 ثواني
✅ **بعد**: الصفحة تعمل بشكل مستقر بدون crashes

### آلية الحماية الجديدة:
1. إذا حدث أكثر من 50 re-render في ثانية واحدة → تحذير في console
2. إذا حدث أكثر من 100 re-render في ثانية واحدة → إيقاف فوري لمنع crash المتصفح
3. إذا حدث 3 crashes في دقيقة واحدة → عرض شاشة خطأ مع إرشادات

## الملفات المعدلة
- `contexts/AccountingContext.tsx` - إصلاح useEffect dependencies + نظام كشف loops
- `hooks/useFirestoreSyncState.ts` - إضافة throttling للتحديثات
- `App.tsx` - حماية من re-renders مفرطة
- `index.html` - تحسين boot recovery
- `index.tsx` - حماية من infinite reload loops

## اختبار الإصلاح
```bash
npm run dev
# أو
npm run build
npm run preview
```

## ملاحظات للمطورين
- راقب console للتحذيرات: `[CRITICAL] Detected excessive re-renders`
- إذا ظهرت هذه الرسالة، تحقق من:
  - useEffect dependencies
  - setState داخل useEffect
  - مقارنات objects/arrays بدون useMemo
