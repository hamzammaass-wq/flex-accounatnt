import { initializePaddle, type Paddle } from '@paddle/paddle-js';

let paddleInstance: Paddle | null = null;

export const getPaddleInstance = async (): Promise<Paddle | null> => {
  if (paddleInstance) return paddleInstance;

  const token = String(import.meta.env.VITE_PADDLE_CLIENT_TOKEN || '').trim();
  if (!token) {
    console.error('[PaddleLoader] VITE_PADDLE_CLIENT_TOKEN is not configured.');
    return null;
  }

  const environment = String(import.meta.env.VITE_PADDLE_ENVIRONMENT || 'production').trim();

  try {
    paddleInstance = await initializePaddle({
      token,
      environment: environment as 'sandbox' | 'production',
      eventCallback: (event: any) => {
        if (event.name === 'checkout.completed') {
          console.log('[PaddleLoader] Checkout completed:', event.data);
          const customEvent = new CustomEvent('paddle.checkout.completed', { detail: event.data });
          window.dispatchEvent(customEvent);
        }
      }
    });
    return paddleInstance;
  } catch (err) {
    console.error('[PaddleLoader] Failed to initialize Paddle.js:', err);
    return null;
  }
};
