import type { CapacitorConfig } from '@capacitor/cli';

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
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
