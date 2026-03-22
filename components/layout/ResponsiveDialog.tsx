import React from 'react';
import ResponsiveOverlay from './ResponsiveOverlay';
import useResponsiveMode from '../../hooks/useResponsiveMode';

type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
type DialogVariant = 'auto' | 'dialog' | 'sheet' | 'fullscreen';

interface ResponsiveDialogProps {
  open: boolean;
  children: React.ReactNode;
  onClose?: () => void;
  size?: DialogSize;
  variant?: DialogVariant;
  zIndexClassName?: string;
  backdropClassName?: string;
  panelClassName?: string;
  showHandle?: boolean;
  closeOnBackdrop?: boolean;
  keyboardAware?: boolean;
}

const sizeClassMap: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-4xl',
  full: 'max-w-[min(98vw,1280px)]'
};

const ResponsiveDialog: React.FC<ResponsiveDialogProps> = ({
  open,
  children,
  onClose,
  size = 'md',
  variant = 'auto',
  zIndexClassName = 'z-[300]',
  backdropClassName,
  panelClassName = '',
  showHandle,
  closeOnBackdrop = true,
  keyboardAware = true
}) => {
  const { overlayVariant, isMobile } = useResponsiveMode();

  const resolvedVariant = (() => {
    if (variant === 'dialog') return 'dialog';
    if (variant === 'sheet') return 'bottom-sheet';
    if (variant === 'fullscreen') return 'fullscreen';
    if (isMobile && (size === 'lg' || size === 'xl' || size === 'full')) return 'fullscreen';
    return overlayVariant;
  })();

  const normalizedPanelClassName = [
    panelClassName,
    resolvedVariant === 'dialog' ? `${sizeClassMap[size]} bg-white` : '',
    resolvedVariant === 'bottom-sheet' ? 'bg-white !w-full !max-w-none h-auto' : '',
    resolvedVariant === 'fullscreen' ? 'bg-white !w-full !h-full !max-w-none !rounded-none' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ResponsiveOverlay
      isOpen={open}
      onClose={onClose}
      variant={resolvedVariant}
      zIndexClassName={zIndexClassName}
      backdropClassName={backdropClassName}
      panelClassName={normalizedPanelClassName}
      showHandle={showHandle ?? resolvedVariant === 'bottom-sheet'}
      onBackdropClick={closeOnBackdrop ? onClose : undefined}
      keyboardAware={keyboardAware}
      swipeToClose={Boolean(onClose)}
    >
      {children}
    </ResponsiveOverlay>
  );
};

export default ResponsiveDialog;
