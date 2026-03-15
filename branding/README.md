Branding masters live in `branding/masters`.

Files:
- `aiflex-erp-logo.svg`: primary vector logo used by the app UI.
- `aiflex-erp-logo.png`: raster backup of the primary logo.
- `aiflex-erp-app-icon.svg`: vector app icon source.
- `aiflex-erp-app-icon.png`: 1024x1024 raster app icon master.

Build flow:
- Run `npm run brand:sync` to copy and resize the saved masters into their runtime locations.
- `npm run build` already runs `npm run brand:sync` before Vite builds the app.

Main output groups:
- Web brand assets in `public/brand`
- Web app icons in `public/icons`
- Android launcher icons in `android/app/src/main/res/mipmap-*`
- iOS app icon in `ios/App/App/Assets.xcassets/AppIcon.appiconset`

When you want to replace branding later, update the master files in `branding/masters` and run `npm run brand:sync`.
