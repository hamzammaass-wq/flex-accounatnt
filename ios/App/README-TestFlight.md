# TestFlight Setup

1. Copy `release.xcconfig.template` to `release.xcconfig`.
2. Replace `YOUR_TEAM_ID` with your Apple Developer Team ID.
3. Open [App.xcodeproj](./App.xcodeproj) on macOS with Xcode.
4. In `Signing & Capabilities`, select your Apple Developer team.
5. Confirm the bundle identifier is `com.smartaccountant.erp` or replace it with your own unique identifier.
6. Update the version/build if needed:
   - `MARKETING_VERSION`
   - `CURRENT_PROJECT_VERSION`
7. Build once on a real iPhone to confirm signing.
8. Run `Product > Archive`.
9. In Organizer, choose `Distribute App > App Store Connect > Upload`.
10. If you export manually, use [ExportOptions-AppStore.plist](./ExportOptions-AppStore.plist).

Notes:
- `Info.plist` already includes camera, microphone, and photo library permission strings.
- The app supports iPhone and iPad with deployment target `iOS 15.0`.
- A Mac with Xcode is still required to create the final `.ipa` and upload to TestFlight.
