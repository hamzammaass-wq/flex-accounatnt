import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartaccountant.erp',
  appName: 'Smart Accountant',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
