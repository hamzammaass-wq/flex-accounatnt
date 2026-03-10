import React from 'react';
import { ShellVariant } from '../../hooks/useResponsiveMode';

interface ResponsiveShellProps {
  children: React.ReactNode;
  rtl?: boolean;
  className?: string;
  shellVariant: ShellVariant;
}

const ResponsiveShell: React.FC<ResponsiveShellProps> = ({ children, rtl = true, className = '', shellVariant }) => {
  return (
    <div
      className={`app-shell-root min-h-dvh bg-gray-50 font-tajawal text-gray-800 overflow-x-hidden ${
        rtl ? 'text-right' : 'text-left'
      } ${className}`.trim()}
      dir={rtl ? 'rtl' : 'ltr'}
    >
      <main className={`app-shell-frame ${shellVariant === 'centered' ? 'app-shell-frame--centered' : 'app-shell-frame--expanded'}`}>
        {children}
      </main>
    </div>
  );
};

export default ResponsiveShell;
