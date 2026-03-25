# Store Release Checklist

## Before App Store / Google Play submission

- Publish a public privacy policy URL.
- Publish a public account deletion URL.
- Verify in-app account deletion works for Email/Password and Google sign-in.
- Prepare App Store `Privacy Policy URL` and Google Play `App access` details.
- Prepare review credentials if the app requires sign-in for review.
- Complete Google Play `Data safety` and `Financial features declaration`.
- Complete Apple `App Privacy` answers to match actual app permissions and data use.
- Confirm Android release signing (`android/key.properties`) is configured.
- Confirm iOS release team, signing, and archive flow on macOS/Xcode.
- Align app version numbers across `package.json`, Android, and iOS.

## Validation run

- `npm test`
- `npm run ci:e2e:playwright`
- `npx tsc --noEmit`
- `npm run build`
