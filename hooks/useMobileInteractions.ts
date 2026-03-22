import { useEffect, useMemo, useRef, type TouchEvent as ReactTouchEvent } from 'react';

interface UseMobileInteractionsOptions {
  isMobile: boolean;
  rtl: boolean;
  canGoBack: boolean;
  onBack: () => void;
}

interface SwipeHandlers {
  onTouchStart: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchMove: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchEnd: (event: ReactTouchEvent<HTMLElement>) => void;
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
  const backTriggeredRef = useRef(false);
  const lastTapAtRef = useRef(0);

  const beginBackGesture = (clientX: number, clientY: number) => {
    if (!isMobile || !canGoBack || typeof window === 'undefined') return;
    startXRef.current = clientX;
    startYRef.current = clientY;
    startTimeRef.current = Date.now();
    cancelledRef.current = false;
    backTriggeredRef.current = false;

    const viewportWidth = window.innerWidth || 0;
    edgeStartRef.current = rtl
      ? clientX >= viewportWidth - EDGE_GESTURE_PX
      : clientX <= EDGE_GESTURE_PX;
  };

  const updateBackGesture = (
    clientX: number,
    clientY: number,
    event?: { cancelable?: boolean; preventDefault?: () => void }
  ) => {
    if (!isMobile || !canGoBack || !edgeStartRef.current || cancelledRef.current) return;
    const dx = clientX - startXRef.current;
    const dy = Math.abs(clientY - startYRef.current);
    const mostlyVertical = dy > Math.abs(dx) * 1.15;
    if (mostlyVertical || dy > MAX_VERTICAL_DRIFT_PX) {
      cancelledRef.current = true;
      return;
    }

    const isBackDirection = rtl ? dx < 0 : dx > 0;
    if (isBackDirection && Math.abs(dx) > 12 && event?.cancelable && event.preventDefault) {
      event.preventDefault();
    }
  };

  const completeBackGesture = (clientX: number, clientY: number) => {
    if (!isMobile || !canGoBack || !edgeStartRef.current || cancelledRef.current || backTriggeredRef.current) {
      edgeStartRef.current = false;
      return;
    }

    const elapsed = Date.now() - startTimeRef.current;
    const dx = clientX - startXRef.current;
    const dy = Math.abs(clientY - startYRef.current);
    const isBackDirection = rtl ? dx <= -SWIPE_THRESHOLD_PX : dx >= SWIPE_THRESHOLD_PX;

    if (isBackDirection && dy <= MAX_VERTICAL_DRIFT_PX && elapsed <= MAX_SWIPE_MS) {
      backTriggeredRef.current = true;
      triggerHaptic(18);
      onBack();
    }

    edgeStartRef.current = false;
  };

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

  useEffect(() => {
    if (!isMobile || typeof document === 'undefined') return;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      beginBackGesture(touch.clientX, touch.clientY);
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      updateBackGesture(touch.clientX, touch.clientY, event);
    };

    const onTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!touch) return;
      completeBackGesture(touch.clientX, touch.clientY);
    };

    const onTouchCancel = () => {
      edgeStartRef.current = false;
      cancelledRef.current = true;
      backTriggeredRef.current = false;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', onTouchCancel, { passive: true, capture: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('touchcancel', onTouchCancel, true);
    };
  }, [isMobile, canGoBack, rtl, onBack]);

  const swipeHandlers = useMemo<SwipeHandlers>(() => ({
    onTouchStart: (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      beginBackGesture(touch.clientX, touch.clientY);
    },
    onTouchMove: (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      updateBackGesture(touch.clientX, touch.clientY, event.nativeEvent);
    },
    onTouchEnd: (event) => {
      const touch = event.changedTouches[0];
      if (!touch) return;
      completeBackGesture(touch.clientX, touch.clientY);
    }
  }), [beginBackGesture, updateBackGesture, completeBackGesture]);

  return {
    swipeHandlers,
    triggerHaptic
  };
};

export default useMobileInteractions;
