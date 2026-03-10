import { useEffect, useMemo, useRef, type TouchEvent } from 'react';

interface UseMobileInteractionsOptions {
  isMobile: boolean;
  rtl: boolean;
  canGoBack: boolean;
  onBack: () => void;
}

interface SwipeHandlers {
  onTouchStart: (event: TouchEvent<HTMLElement>) => void;
  onTouchMove: (event: TouchEvent<HTMLElement>) => void;
  onTouchEnd: (event: TouchEvent<HTMLElement>) => void;
}

const EDGE_GESTURE_PX = 28;
const SWIPE_THRESHOLD_PX = 70;
const MAX_VERTICAL_DRIFT_PX = 54;
const MAX_SWIPE_MS = 560;
const KEYBOARD_OPEN_THRESHOLD_PX = 80;

const triggerHaptic = (duration = 10) => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(duration);
};

const getOrientation = (): 'portrait' | 'landscape' => {
  if (typeof window === 'undefined') return 'portrait';
  return window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
};

const setViewportCssVars = () => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const vh = viewport?.height || window.innerHeight;
  const keyboardInsetRaw = viewport
    ? Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop))
    : 0;
  const keyboardInset = keyboardInsetRaw > 0 ? keyboardInsetRaw : 0;
  root.style.setProperty('--app-vh', `${vh * 0.01}px`);
  root.style.setProperty('--app-keyboard-inset', `${keyboardInset}px`);
  root.dataset.orientation = getOrientation();
  root.dataset.keyboardOpen = keyboardInset >= KEYBOARD_OPEN_THRESHOLD_PX ? '1' : '0';
};

export const useMobileInteractions = ({
  isMobile,
  rtl,
  canGoBack,
  onBack
}: UseMobileInteractionsOptions) => {
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const edgeStartRef = useRef(false);
  const cancelledRef = useRef(false);
  const lastTapAtRef = useRef(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.touch = isMobile ? '1' : '0';
    setViewportCssVars();

    const onResize = () => setViewportCssVars();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || typeof document === 'undefined') return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('button, [role="button"], a[href], input, select, textarea, .clickable')) return;
      const now = Date.now();
      if (now - lastTapAtRef.current < 40) return;
      lastTapAtRef.current = now;
      triggerHaptic(8);
    };

    document.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isMobile]);

  const swipeHandlers = useMemo<SwipeHandlers>(() => ({
    onTouchStart: (event) => {
      if (!isMobile || !canGoBack) return;
      const touch = event.touches[0];
      if (!touch) return;
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      startTimeRef.current = Date.now();
      cancelledRef.current = false;

      const viewportWidth = window.innerWidth || 0;
      edgeStartRef.current = rtl
        ? startXRef.current >= viewportWidth - EDGE_GESTURE_PX
        : startXRef.current <= EDGE_GESTURE_PX;
    },
    onTouchMove: (event) => {
      if (!isMobile || !canGoBack || !edgeStartRef.current || cancelledRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startXRef.current;
      const dy = Math.abs(touch.clientY - startYRef.current);
      const mostlyVertical = dy > Math.abs(dx) * 1.15;
      if (mostlyVertical || dy > MAX_VERTICAL_DRIFT_PX) {
        cancelledRef.current = true;
      }
    },
    onTouchEnd: (event) => {
      if (!isMobile || !canGoBack || !edgeStartRef.current || cancelledRef.current) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const elapsed = Date.now() - startTimeRef.current;
      const dx = touch.clientX - startXRef.current;
      const dy = Math.abs(touch.clientY - startYRef.current);
      const isBackDirection = rtl ? dx <= -SWIPE_THRESHOLD_PX : dx >= SWIPE_THRESHOLD_PX;
      if (isBackDirection && dy <= MAX_VERTICAL_DRIFT_PX && elapsed <= MAX_SWIPE_MS) {
        triggerHaptic(18);
        onBack();
      }
    }
  }), [isMobile, canGoBack, rtl, onBack]);

  return {
    swipeHandlers,
    triggerHaptic
  };
};

export default useMobileInteractions;
