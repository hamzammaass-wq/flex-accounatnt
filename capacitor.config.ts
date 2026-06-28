import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const firebaseAuthenticationConfig = {
  skipNativeAuth: true,
  providers: ['google.com'],
  clientId: '879535686153-uomsq0iinc3eqq1vpqqm8qemu3c0v06l.apps.googleusercontent.com',
};

const config: CapacitorConfig = {
  appId: 'com.smartaccountant.erp',
  appName: 'المحاسب فلكس (flex accaountant)',
  webDir: 'dist',
  server: {
    url: 'https://smart-account-cc181.web.app',
    cleartext: true,
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
    FirebaseAuthentication: firebaseAuthenticationConfig,
  },
};

export default config;
