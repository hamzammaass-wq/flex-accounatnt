import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const firebaseAuthenticationConfig = {
  skipNativeAuth: true,
  providers: ['google.com'],
  clientId: '879535686153-uomsq0iinc3eqq1vpqqm8qemu3c0v06l.apps.googleusercontent.com',
};

const config: CapacitorConfig = {
  appId: 'com.smartaccountant.erp',
  appName: 'Flex Accountant',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
    FirebaseAuthentication: firebaseAuthenticationConfig,
  },
};

export default config;
