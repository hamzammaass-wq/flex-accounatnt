import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleReload = () => {
    // Clear cache and reload
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => caches.delete(key));
      });
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => reg.unregister());
      });
    }

    window.location.reload();
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isOutOfMemory =
        this.state.error?.message?.toLowerCase().includes('memory') ||
        this.state.error?.message?.toLowerCase().includes('heap') ||
        this.state.error?.name === 'RangeError';

      const isRenderLoop =
        this.state.error?.message?.toLowerCase().includes('render') ||
        this.state.error?.message?.toLowerCase().includes('re-render');

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4 font-tajawal">
          <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-red-600" />
              </div>
            </div>

            <h1 className="text-3xl font-black text-slate-800 mb-3">
              عذراً
            </h1>
            <h2 className="text-xl font-bold text-slate-600 mb-6">
              حدث خطأ ما أثار هذه الصفحة
            </h2>

            {isOutOfMemory && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6 text-right">
                <p className="text-red-800 font-bold text-lg mb-2">
                  Out of Memory
                </p>
                <p className="text-red-700 text-sm leading-relaxed">
                  نفذت ذاكرة المتصفح. قد يكون هناك الكثير من البيانات محملة في الصفحة.
                  جرب إعادة تحميل الصفحة أو إغلاق بعض علامات التبويب الأخرى.
                </p>
              </div>
            )}

            {isRenderLoop && (
              <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 mb-6 text-right">
                <p className="text-orange-800 font-bold text-lg mb-2">
                  Excessive Re-renders Detected
                </p>
                <p className="text-orange-700 text-sm leading-relaxed">
                  تم اكتشاف عدد كبير جداً من عمليات إعادة العرض.
                  جرب إعادة تحميل الصفحة لإصلاح المشكلة.
                </p>
              </div>
            )}

            {!isOutOfMemory && !isRenderLoop && (
              <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4 mb-6 text-right">
                <p className="text-slate-700 text-sm leading-relaxed">
                  حدث خطأ غير متوقع في التطبيق. جرب إعادة تحميل الصفحة أو العودة إلى الصفحة الرئيسية.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-lg"
              >
                <RefreshCw size={20} />
                <span>إعادة التحميل</span>
              </button>

              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors"
              >
                <Home size={20} />
                <span>محاولة المتابعة</span>
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left bg-slate-100 rounded-lg p-4 mt-6">
                <summary className="cursor-pointer font-bold text-slate-700 mb-2">
                  Error Details (Development Only)
                </summary>
                <div className="text-xs font-mono text-slate-600 space-y-2">
                  <div>
                    <strong>Error:</strong> {this.state.error.toString()}
                  </div>
                  {this.state.errorInfo && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="mt-1 text-xs overflow-auto max-h-40 bg-white p-2 rounded border border-slate-300">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                  {this.state.error.stack && (
                    <div>
                      <strong>Stack Trace:</strong>
                      <pre className="mt-1 text-xs overflow-auto max-h-40 bg-white p-2 rounded border border-slate-300">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <p className="text-xs text-slate-500 mt-6">
              إذا استمرت المشكلة، يرجى الاتصال بالدعم الفني
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
