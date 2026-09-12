Branding masters live in `branding/masters`.

Files:
- `flex-erp-logo.png`: primary logo master.
- `flex-erp-app-icon.png`: 1024x1024 raster app icon master.
- `flex-erp-ios-icon.png`: 1024x1024 iOS-specific app icon master used when the iPhone icon needs a full-bleed version.

Generated automatically during `npm run brand:sync`:
- `public/brand/flex-erp-logo.svg`
- `public/brand/flex-erp-mark.svg`
- `public/icons/icon-192.svg`
- `public/icons/icon-512.svg`

Build flow:
- Run `npm run brand:sync` to copy the PNG masters, generate the SVG wrappers, and resize everything into runtime locations.
- `npm run build` already runs `npm run brand:sync` before Vite builds the app.

Main output groups:
- Web brand assets in `public/brand`
- Web app icons in `public/icons`
- Android launcher icons in `android/app/src/main/res/mipmap-*`
- iOS app icon in `ios/App/App/Assets.xcassets/AppIcon.appiconset`

When you want to replace branding later, update the master files in `branding/masters` and run `npm run brand:sync`.
