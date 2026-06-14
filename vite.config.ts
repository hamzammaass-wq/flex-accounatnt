import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const geminiApiKey =
      env.VITE_GEMINI_API_KEY ||
      env.GEMINI_API_KEY ||
      env.VITE_API_KEY ||
      env.API_KEY ||
      '';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        watch: {
          ignored: ['**/android/**', '**/ios/**', '**/dist/**', '**/functions/backend-dist/**']
        }
      },
      build: {
        chunkSizeWarningLimit: 700,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) {
                return undefined;
              }

              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }

              if (id.includes('xlsx')) {
                return 'vendor-xlsx';
              }

              if (id.includes('recharts')) {
                return 'vendor-charts';
              }

              if (id.includes('framer-motion')) {
                return 'vendor-motion';
              }

              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }

              if (id.includes('@google/genai')) {
                return 'vendor-ai';
              }

              if (id.includes('sql.js')) {
                return 'vendor-sqljs';
              }

              if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('jsbarcode')) {
                return 'vendor-print';
              }

              if (id.includes('html5-qrcode')) {
                return 'vendor-qrcode';
              }

              if (id.includes('@capacitor')) {
                return 'vendor-capacitor';
              }

              if (id.includes('react') || id.includes('scheduler')) {
                return 'vendor-react';
              }

              return 'vendor';
            }
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(geminiApiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiApiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
