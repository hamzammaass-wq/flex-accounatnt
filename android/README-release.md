# Android Release Build

Release signing is wired through:

- `android/key.properties`
- `android/keystore/smart-accountant-upload.jks`

Build commands:

- `npm run android:release` for the signed APK
- `npm run android:bundle` for the signed AAB
- `npm run android:ship` for both

Output files:

- `android/app/build/outputs/apk/release/app-release.apk`
- `android/app/build/outputs/bundle/release/app-release.aab`

Important:

- Back up the keystore and `android/key.properties` before publishing updates.
- If you lose the keystore, you cannot publish updates to the same Android app identity.
