import React from 'react';
import { createPortal } from 'react-dom';
import useResponsiveMode, { OverlayVariant } from '../../hooks/useResponsiveMode';

interface ResponsiveOverlayProps {
  children: React.ReactNode;
  isOpen: boolean;
  onBackdropClick?: () => void;
  variant?: OverlayVariant | 'auto';
  zIndexClassName?: string;
  backdropClassName?: string;
  panelClassName?: string;
  showHandle?: boolean;
  keyboardAware?: boolean;
}

const ResponsiveOverlay: React.FC<ResponsiveOverlayProps> = ({
  children,
  isOpen,
  onBackdropClick,
  variant = 'auto',
  zIndexClassName = 'z-[100]',
  backdropClassName = 'bg-black/40 backdrop-blur-sm',
  panelClassName = '',
  showHandle = false,
  keyboardAware = true
}) => {
  const { overlayVariant } = useResponsiveMode();
  if (!isOpen) return null;

  const resolvedVariant = variant === 'auto' ? overlayVariant : variant;
  const isSheet = resolvedVariant === 'bottom-sheet';
  const isDialog = resolvedVariant === 'dialog';
  const isFullscreen = resolvedVariant === 'fullscreen';
  const keyboardInsetVar = 'var(--app-keyboard-inset, 0px)';
  const fullHeightWithKeyboard = `calc(100dvh - ${keyboardInsetVar})`;
  const panelStyle: React.CSSProperties = keyboardAware
    ? isSheet
      ? { height: fullHeightWithKeyboard, maxHeight: fullHeightWithKeyboard }
      : isDialog
        ? { maxHeight: `calc(100dvh - ${keyboardInsetVar} - 1.5rem)` }
        : isFullscreen
          ? { height: fullHeightWithKeyboard, maxHeight: fullHeightWithKeyboard }
          : {}
    : {};

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
        style={panelStyle}
        onClick={e => e.stopPropagation()}
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
