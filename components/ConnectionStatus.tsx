import { useState, useEffect } from 'react';

export const ConnectionStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showWarning, setShowWarning] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowWarning(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowWarning(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!showWarning) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-3 px-4 z-[9999] shadow-lg"
      dir="rtl"
    >
      <div className="flex items-center justify-center gap-2">
        <span className="text-xl">⚠️</span>
        <span className="font-bold">لا يوجد اتصال بالإنترنت</span>
      </div>
      <div className="text-sm mt-1 opacity-90">
        التطبيق يحتاج اتصال بالسيرفر للعمل (مثل Odoo)
      </div>
    </div>
  );
};
