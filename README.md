<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1YKXRqZo3bwc7SycD5HPLuUBLS_jQ-4cT

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set keys:
   - Required: `GEMINI_API_KEY`
   - Optional (for Firebase Auth): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
3. Run the app:
   `npm run dev`

## Firebase Auth setup

- In Firebase Console, create a Web app and copy the configuration values.
- Keep only the values you need available in `.env.local`.
- If any Firebase variable is missing, the app will fall back to the existing Supabase flow.
