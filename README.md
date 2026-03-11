# AIFLEX ERP

AIFLEX ERP is a Vite + React + Capacitor application with Supabase-backed auth and Firebase Hosting deployment.

## Access From Anywhere

- Source code lives in GitHub and can be edited locally or in GitHub Codespaces.
- Pushes to `main` deploy the web app to Firebase Hosting project `smart-account-cc181`.
- Pull requests create Firebase Hosting preview deployments for review before merge.

## Local Setup

1. Install Node.js 22 or use the version in `.nvmrc`.
2. Copy `.env.example` to `.env.local`.
3. Replace placeholder values in `.env.local` as needed.
4. Install dependencies with `npm ci`.
5. Start the app with `npm run dev`.
6. Open `http://localhost:3000`.

## GitHub Codespaces

1. Open the repository in a new Codespace.
2. The dev container installs dependencies and creates `.env.local` from `.env.example` if it does not exist yet.
3. Add repository or Codespaces secrets for any real keys you need, then update `.env.local`.
4. Run `npm run dev` and open the forwarded port `3000`.

## Required Secrets And External Settings

- GitHub Actions secret: `FIREBASE_SERVICE_ACCOUNT_SMART_ACCOUNT_CC181`
- Supabase publishable key if you want to override the fallback: `VITE_SUPABASE_ANON_KEY`
- Gemini key for AI features: `GEMINI_API_KEY` or `VITE_GEMINI_API_KEY`

Because OAuth redirects are generated from the current browser origin, add every real app URL to Supabase Auth redirect settings, including:

- Your Firebase Hosting domain
- Any GitHub Codespaces public URL you plan to use

## Deployment

- Merge or push to `main` to deploy production to Firebase Hosting.
- Open a pull request to get a preview deployment from GitHub Actions.
