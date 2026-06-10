# بناء تطبيق iPhone من GitHub

تم تجهيز Workflow باسم `Build iOS App` داخل GitHub Actions.

## تشغيل بناء بدون توقيع

1. افتح المستودع على GitHub.
2. ادخل إلى `Actions`.
3. اختر `Build iOS App`.
4. اضغط `Run workflow`.
5. اختر `build_type = unsigned`.
6. بعد انتهاء التشغيل، نزّل ملف `SmartAccountant-iOS-...-unsigned.ipa` من Artifacts.

هذه النسخة مفيدة للفحص، لكنها ليست جاهزة للرفع إلى App Store أو TestFlight لأنها غير موقعة من Apple.

## تشغيل بناء App Store / TestFlight

أضف هذه الأسرار في:
`GitHub Repository > Settings > Secrets and variables > Actions > New repository secret`

- `APPLE_TEAM_ID`
- `IOS_DISTRIBUTION_CERTIFICATE_P12_BASE64`
- `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`

اختياريًا، إذا أردت عدم حفظ ملف Firebase داخل المستودع:

- `IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64`

بعد إضافة الأسرار:

1. افتح `Actions`.
2. اختر `Build iOS App`.
3. اضغط `Run workflow`.
4. اختر `build_type = app-store`.
5. استخدم الإصدار الافتراضي `1.0.17` ورقم البناء `2026061001` أو ارفع الرقم عند كل إصدار جديد.
6. نزّل ملف الـ IPA الموقّع من Artifacts وارفعه إلى App Store Connect أو TestFlight.

## تحويل الملفات إلى Base64

على macOS:

```bash
base64 -i ios_distribution.p12 | pbcopy
base64 -i profile.mobileprovision | pbcopy
base64 -i GoogleService-Info.plist | pbcopy
```

على Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ios_distribution.p12")) | Set-Clipboard
[Convert]::ToBase64String([IO.File]::ReadAllBytes("profile.mobileprovision")) | Set-Clipboard
[Convert]::ToBase64String([IO.File]::ReadAllBytes("GoogleService-Info.plist")) | Set-Clipboard
```
