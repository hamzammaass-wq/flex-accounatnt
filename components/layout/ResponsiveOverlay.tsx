import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useResponsiveMode, { OverlayVariant } from '../../hooks/useResponsiveMode';

interface ResponsiveOverlayProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose?: () => void;
  onBackdropClick?: () => void;
  variant?: OverlayVariant | 'auto';
  zIndexClassName?: string;
  backdropClassName?: string;
  panelClassName?: string;
  showHandle?: boolean;
  keyboardAware?: boolean;
  swipeToClose?: boolean;
}

const SWIPE_CLOSE_THRESHOLD_PX = 92;
const SWIPE_CLOSE_TOP_ZONE_PX = 96;

const isInteractiveSwipeTarget = (target: EventTarget | null) => (
  target instanceof HTMLElement
  && Boolean(target.closest('button, a[href], input, select, textarea, [role="button"], [data-swipe-close-disabled="true"]'))
);

const ResponsiveOverlay: React.FC<ResponsiveOverlayProps> = ({
  children,
  isOpen,
  onClose,
  onBackdropClick,
  variant = 'auto',
  zIndexClassName = 'z-[100]',
  backdropClassName = 'bg-black/40 backdrop-blur-sm',
  panelClassName = '',
  showHandle = false,
  keyboardAware = true,
  swipeToClose = true
}) => {
  const { overlayVariant, isMobile } = useResponsiveMode();
  const swipeStateRef = useRef({
    active: false,
    dragging: false,
    startX: 0,
    startY: 0
  });
  const [swipeOffsetY, setSwipeOffsetY] = useState(0);

  const resolvedVariant = variant === 'auto' ? overlayVariant : variant;
  const isSheet = resolvedVariant === 'bottom-sheet';
  const isDialog = resolvedVariant === 'dialog';
  const isFullscreen = resolvedVariant === 'fullscreen';
  const closeAction = onClose || onBackdropClick;
  const canSwipeClose = Boolean(closeAction && swipeToClose && isMobile && (isSheet || isFullscreen));
  const keyboardInsetVar = 'var(--app-keyboard-inset, 0px)';
  const fullHeightWithKeyboard = `calc(100dvh - ${keyboardInsetVar})`;
  const panelStyle: React.CSSProperties = keyboardAware
    ? isSheet
      ? { height: fullHeightWithKeyboard, maxHeight: fullHeightWithKeyboard }
      : isDialog
        ? { maxHeight: `calc(100dvh - ${keyboardInsetVar} - 1.5rem)` }
        : {}
    : {};
  const interactivePanelStyle: React.CSSProperties = canSwipeClose && swipeOffsetY > 0
    ? {
      ...panelStyle,
      transform: `translate3d(0, ${swipeOffsetY}px, 0)`,
      transition: 'none',
      willChange: 'transform'
    }
    : panelStyle;

  const resetSwipeState = () => {
    swipeStateRef.current = {
      active: false,
      dragging: false,
      startX: 0,
      startY: 0
    };
    setSwipeOffsetY(0);
  };

  useEffect(() => {
    if (!isOpen) resetSwipeState();
  }, [isOpen]);

  const handlePanelTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!canSwipeClose) return;
    const touch = event.touches[0];
    const panel = event.currentTarget;
    if (!touch || panel.scrollTop > 4 || isInteractiveSwipeTarget(event.target)) {
      resetSwipeState();
      return;
    }

    const topZone = touch.clientY - panel.getBoundingClientRect().top;
    if (topZone > SWIPE_CLOSE_TOP_ZONE_PX) {
      resetSwipeState();
      return;
    }

    swipeStateRef.current = {
      active: true,
      dragging: false,
      startX: touch.clientX,
      startY: touch.clientY
    };
  };

  const handlePanelTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!canSwipeClose || !swipeStateRef.current.active) return;
    const touch = event.touches[0];
    if (!touch) return;

    const deltaX = Math.abs(touch.clientX - swipeStateRef.current.startX);
    const deltaY = touch.clientY - swipeStateRef.current.startY;
    if (deltaY <= 0) {
      resetSwipeState();
      return;
    }
    if (deltaX > deltaY * 0.9) {
      resetSwipeState();
      return;
    }

    swipeStateRef.current.dragging = true;
    setSwipeOffsetY(Math.min(deltaY, 220));
    if (event.cancelable) {
      event.preventDefault();
    }
  };

  const handlePanelTouchEnd = () => {
    if (!canSwipeClose || !swipeStateRef.current.dragging) {
      resetSwipeState();
      return;
    }

    const shouldClose = swipeOffsetY >= SWIPE_CLOSE_THRESHOLD_PX;
    resetSwipeState();
    if (!shouldClose) return;

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(14);
    }
    closeAction?.();
  };

  if (!isOpen) return null;

  const overlayNode = (
    <div
      className={`fixed inset-0 ${zIndexClassName} animate-in fade-in duration-200 ${backdropClassName} overscroll-none ${
        isSheet ? 'flex items-end justify-center' : isDialog ? 'flex items-center justify-center p-4 md:p-6' : 'flex'
      }`}
      onClick={onBackdropClick}
    >
      <div
        className={`relative bg-gray-50 shadow-2xl overflow-y-auto overflow-x-hidden overscroll-contain animate-in ${
          isSheet
            ? `w-full rounded-t-[2.5rem] slide-in-from-bottom-full duration-300 ${keyboardAware ? '' : 'h-[92dvh]'}`
            : isDialog
              ? `w-full max-w-[min(96vw,var(--app-content-max-width-tablet-browser))] rounded-[2.25rem] zoom-in-95 duration-200 ${keyboardAware ? '' : 'max-h-[92dvh]'}`
              : 'w-full h-full rounded-none'
        } ${panelClassName}`.trim()}
        style={interactivePanelStyle}
        onClick={e => e.stopPropagation()}
        onTouchStart={handlePanelTouchStart}
        onTouchMove={handlePanelTouchMove}
        onTouchEnd={handlePanelTouchEnd}
        onTouchCancel={resetSwipeState}
      >
        {showHandle && isSheet && (
          <div className="sticky top-0 z-[2] bg-gray-50/90 backdrop-blur px-6 py-4 flex justify-center">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
          </div>
        )}
        {children}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return overlayNode;
  return createPortal(overlayNode, document.body);
};

export default ResponsiveOverlay;
