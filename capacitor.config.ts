import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartaccountant.erp',
  appName: 'AIFLEX ERP',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
