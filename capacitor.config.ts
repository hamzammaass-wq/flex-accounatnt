import type { CapacitorConfig } from '@capacitor/cli';

const firebaseAuthenticationConfig = {
  skipNativeAuth: true,
  providers: ['google.com'],
  clientId: '879535686153-uomsq0iinc3eqq1vpqqm8qemu3c0v06l.apps.googleusercontent.com',
};

const config: CapacitorConfig = {
  appId: 'com.smartaccountant.erp',
  appName: 'المحاسب الذكي (AIFLEX Smart Accountant)',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    FirebaseAuthentication: firebaseAuthenticationConfig,
  },
};

export default config;
