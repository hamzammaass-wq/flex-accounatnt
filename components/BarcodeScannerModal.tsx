import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, X, Check, Volume2, VolumeX, Flashlight } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { createPortal } from 'react-dom';
import { ensureCameraPermission } from '../utils/cameraPermission';

export interface BarcodeScannerModalProps {
  /** Whether the scanner modal is open */
  open: boolean;
  /** Called when the user closes the scanner */
  onClose: () => void;
  /** Called when a barcode is successfully scanned */
  onScan: (code: string) => void;
  /** Enable continuous scanning mode (for invoices/stocktake) — scanner stays open after each scan */
  continuous?: boolean;
  /** Cooldown between scans in continuous mode (ms). Default: 1200 */
  cooldownMs?: number;
  /** Title text to show at the bottom of the scanner */
  title?: string;
  /** Translation function: (ar, en) => string */
  tr?: (ar: string, en: string) => string;
}

const READER_ID = 'shared-barcode-scanner-reader';

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
];

// Generate a short beep sound for scan success feedback
const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = 'square';
    oscillator.frequency.value = 1800;
    gain.gain.value = 0.08;
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    oscillator.stop(ctx.currentTime + 0.12);
  } catch {
    // Audio not supported, silently ignore
  }
};

const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  onClose,
  onScan,
  continuous = false,
  cooldownMs = 1200,
  title,
  tr = (ar: string, _en: string) => ar,
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const [scanCount, setScanCount] = useState(0);
  const [lastScanned, setLastScanned] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [error, setError] = useState('');
  const [scanAttempts, setScanAttempts] = useState(0);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setScanCount(0);
      setLastScanned('');
      setShowSuccess(false);
      setShowManualInput(false);
      setManualValue('');
      setError('');
      setScanAttempts(0);
      cooldownRef.current = false;
    }
  }, [open]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      const qr = scannerRef.current;
      scannerRef.current = null;
      try {
        if (qr.isScanning) {
          await qr.stop();
        }
        await qr.clear();
      } catch (e) {
        console.error('[BarcodeScannerModal] Error stopping scanner:', e);
      }
    }
  }, []);

  const handleClose = useCallback(async () => {
    await stopScanner();
    onClose();
  }, [stopScanner, onClose]);

  const toggleTorch = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      const qr = scannerRef.current;
      const state = qr.getState();
      if (state === 2) { // SCANNING state
        // Try to access the video track and toggle torch
        const stream = (qr as any).stream;
        if (stream) {
          const tracks = stream.getVideoTracks();
          if (tracks.length > 0) {
            const track = tracks[0];
            const capabilities = track.getCapabilities?.();
            if (capabilities && 'torch' in capabilities) {
              const newTorchState = !torchEnabled;
              await track.applyConstraints({
                advanced: [{ torch: newTorchState } as any]
              });
              setTorchEnabled(newTorchState);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[BarcodeScannerModal] Torch not supported:', err);
    }
  }, [torchEnabled]);

  const handleScanResult = useCallback((decodedText: string) => {
    const scanned = String(decodedText || '').trim();
    if (!scanned || cooldownRef.current) return;

    if (soundEnabled) playBeep();

    setLastScanned(scanned);
    setShowSuccess(true);
    setScanCount(prev => prev + 1);
    onScan(scanned);

    if (continuous) {
      // In continuous mode, apply cooldown to prevent duplicate scans
      cooldownRef.current = true;
      // Clear any existing cooldown timer
      if (cooldownTimerRef.current) {
        window.clearTimeout(cooldownTimerRef.current);
      }
      cooldownTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current) {
          cooldownRef.current = false;
          setShowSuccess(false);
        }
        cooldownTimerRef.current = null;
      }, cooldownMs);
    } else {
      // In single mode, close after scan
      stopScanner().then(() => {
        if (mountedRef.current) onClose();
      });
    }
  }, [continuous, cooldownMs, soundEnabled, onScan, onClose, stopScanner]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      try {
        if (soundEnabled) playBeep();
        
        // Stop live scanning if active
        if (scannerRef.current?.isScanning) {
          await scannerRef.current.stop();
        }

        // Helper to get an image element from file
        const getImgElement = (f: File): Promise<HTMLImageElement> => {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(f);
          });
        };

        const img = await getImgElement(file);
        
        // 1. Try Native BarcodeDetector API (Extremely fast, available on modern Android/iOS 17+)
        if ('BarcodeDetector' in window) {
          try {
            const detector = new (window as any).BarcodeDetector({ 
              formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] 
            });
            const barcodes = await detector.detect(img);
            if (barcodes.length > 0) {
              handleScanResult(barcodes[0].rawValue);
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
            }
          } catch (detectorErr) {
            console.warn('[BarcodeScannerModal] Native detector failed, falling back:', detectorErr);
          }
        }

        // 2. Fallback to html5-qrcode
        // Resize image first because huge iOS photos (12MP+) crash the WASM decoder or fail to find barcodes
        const canvas = document.createElement('canvas');
        const MAX_DIM = 1024;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          // Convert dataurl back to file
          const res = await fetch(resizedDataUrl);
          const blob = await res.blob();
          const resizedFile = new File([blob], "resized.jpg", { type: "image/jpeg" });
          
          let qr = scannerRef.current;
          if (!qr) {
            qr = new Html5Qrcode(READER_ID);
            scannerRef.current = qr;
          }
          
          const decodedText = await qr.scanFile(resizedFile, false);
          handleScanResult(decodedText);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        throw new Error("Could not process image");

      } catch (err: any) {
        console.error('[BarcodeScannerModal] File scan error:', err);
        // Special message if the error is exactly "NotFoundException" from zxing
        setError(tr('لم يتم العثور على باركود بوضوح. تأكد من إضاءة الصورة واقترابها.', 'No clear barcode found in image. Make sure it is well lit and close.'));
      }
      
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Start scanner when modal opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const initScanner = async () => {
      const hasPermission = await ensureCameraPermission(tr);
      if (!hasPermission || cancelled) {
        if (!cancelled) onClose();
        return;
      }

      // Wait for DOM element to be available
      await new Promise(resolve => setTimeout(resolve, 100));

      if (cancelled || !mountedRef.current) return;

      const container = document.getElementById(READER_ID);
      if (!container) {
        console.error('[BarcodeScannerModal] Scanner container not found');
        return;
      }

      try {
        const html5QrCode = new Html5Qrcode(READER_ID, {
          formatsToSupport: SUPPORTED_FORMATS,
          verbose: true, // Enable verbose logging for debugging
        });
        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
          // Restoring a square qrbox is critical for iOS. Without it, the high-res full frame makes barcodes too small to detect in WASM.
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minDimension = Math.min(viewfinderWidth, viewfinderHeight);
            const boxSize = Math.floor(minDimension * 0.85);
            return { width: boxSize, height: boxSize };
          },
        };

        // Proper video constraints for iOS (placed in the correct argument)
        const videoConstraints = {
          facingMode: 'environment',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          advanced: [{ focusMode: 'continuous' } as any, { zoom: 1.5 } as any]
        };

        await html5QrCode.start(
          videoConstraints,
          config,
          (decodedText) => {
            if (!cancelled) handleScanResult(decodedText);
          },
          (errorMessage, error) => {
            // Log scan errors for debugging and update attempts counter
            if (error) {
              console.debug('[BarcodeScannerModal] Scan attempt:', errorMessage);
              setScanAttempts(prev => prev + 1);
            }
          }
        );
      } catch (err: any) {
        if (cancelled) return;
        console.warn('[BarcodeScannerModal] Failed to start scanner with advanced constraints. Retrying with basic constraints...', err);

        try {
          // Ensure complete cleanup before retry
          if (scannerRef.current) {
            try {
              if (scannerRef.current.isScanning) {
                await scannerRef.current.stop();
              }
              await scannerRef.current.clear();
              scannerRef.current = null;
            } catch (cleanupErr) {
              console.warn('[BarcodeScannerModal] Cleanup failed before retry:', cleanupErr);
            }
          }

          const html5QrCode = new Html5Qrcode(READER_ID, {
            formatsToSupport: SUPPORTED_FORMATS,
            verbose: true,
          });
          scannerRef.current = html5QrCode;

          const basicConfig = {
            fps: 10,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minDimension = Math.min(viewfinderWidth, viewfinderHeight);
              const boxSize = Math.floor(minDimension * 0.85);
              return { width: boxSize, height: boxSize };
            },
          };

          await html5QrCode.start(
            { facingMode: 'environment' },
            basicConfig,
            (decodedText) => {
              if (!cancelled) handleScanResult(decodedText);
            },
            (errorMessage, error) => {
              if (error) {
                console.debug('[BarcodeScannerModal] Scan attempt:', errorMessage);
                setScanAttempts(prev => prev + 1);
              }
            }
          );
        } catch (retryErr: any) {
          if (cancelled) return;
          console.error('[BarcodeScannerModal] Failed to start scanner even with basic constraints:', retryErr);
          const errMsg = retryErr?.message || retryErr?.name || String(retryErr || '');
          setError(errMsg);
        }
      }
    };

    initScanner();

    return () => {
      cancelled = true;
      // Clear cooldown timer if active
      if (cooldownTimerRef.current) {
        window.clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      stopScanner();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = manualValue.trim();
    if (!value) return;
    handleScanResult(value);
    setManualValue('');
    if (!continuous) {
      setShowManualInput(false);
    }
  };

  useEffect(() => {
    if (showManualInput && manualInputRef.current) {
      manualInputRef.current.focus();
    }
  }, [showManualInput]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[350] flex flex-col bg-black">
      {/* Camera View */}
      <div className="relative flex-1 bg-black overflow-hidden">
        <div id={READER_ID} className="h-full w-full" />

        {/* Scanning Overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-[min(85vw,400px)] aspect-square rounded-2xl border-[3px] relative transition-colors duration-300 ${
              showSuccess ? 'border-emerald-400' : 'border-blue-400/80'
            }`}
            style={{
              boxShadow: showSuccess
                ? '0 0 0 9999px rgba(0,0,0,0.45), 0 0 30px rgba(52,211,153,0.4)'
                : '0 0 0 9999px rgba(0,0,0,0.5)',
            }}
          >
            {/* Corner marks */}
            <div className="absolute -top-[3px] -left-[3px] w-8 h-8 border-t-[4px] border-l-[4px] border-blue-400 rounded-tl-xl" />
            <div className="absolute -top-[3px] -right-[3px] w-8 h-8 border-t-[4px] border-r-[4px] border-blue-400 rounded-tr-xl" />
            <div className="absolute -bottom-[3px] -left-[3px] w-8 h-8 border-b-[4px] border-l-[4px] border-blue-400 rounded-bl-xl" />
            <div className="absolute -bottom-[3px] -right-[3px] w-8 h-8 border-b-[4px] border-r-[4px] border-blue-400 rounded-br-xl" />

            {/* Animated scanning line */}
            {!showSuccess && (
              <div
                className="absolute left-2 right-2 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent"
                style={{
                  animation: 'barcode-scan-line 2s ease-in-out infinite',
                }}
              />
            )}

            {/* Success checkmark */}
            {showSuccess && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/90 flex items-center justify-center animate-[barcode-pop_0.3s_ease-out]">
                  <Check size={28} className="text-white" strokeWidth={3} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scan status indicator */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          {continuous && scanCount > 0 ? (
            <div className="bg-emerald-500/90 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-black flex items-center gap-2 shadow-lg">
              <Check size={14} />
              <span>{scanCount}</span>
              <span className="text-emerald-100 text-[11px]">{tr('تم مسحه', 'scanned')}</span>
            </div>
          ) : scanAttempts > 10 && !showSuccess ? (
            <div className="bg-blue-500/90 backdrop-blur-sm text-white px-4 py-2 rounded-full text-xs font-black flex items-center gap-2 shadow-lg">
              <Camera size={14} className="animate-pulse" />
              <span>{tr('جاري المسح...', 'Scanning...')}</span>
            </div>
          ) : null}
        </div>

        {/* Last scanned barcode display */}
        {lastScanned && showSuccess && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-black/70 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-xs font-mono font-bold shadow-lg dir-ltr">
              {lastScanned}
            </div>
          </div>
        )}

        {/* Scanning tips after many attempts */}
        {!showSuccess && scanAttempts > 50 && !error && (
          <div className="absolute bottom-24 left-4 right-4 z-10">
            <div className="bg-blue-600/95 backdrop-blur-sm text-white px-4 py-3 rounded-xl text-[11px] font-bold shadow-lg space-y-1.5">
              <p className="font-black">{tr('نصائح للمسح الأفضل:', 'Tips for better scanning:')}</p>
              <ul className="space-y-0.5 text-[10px] list-disc list-inside">
                <li>{tr('تأكد من الإضاءة الجيدة أو استخدم المصباح', 'Ensure good lighting or use flashlight')}</li>
                <li>{tr('اقترب أو ابتعد حتى يظهر الباركود بوضوح', 'Move closer or farther until barcode is clear')}</li>
                <li>{tr('حافظ على ثبات الهاتف', 'Keep phone steady')}</li>
                <li>{tr('تأكد من نظافة عدسة الكاميرا', 'Clean camera lens')}</li>
              </ul>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/80">
            <div className="bg-white rounded-2xl p-6 mx-6 max-w-md text-center space-y-3">
              <div className="text-red-500 text-4xl">📷</div>
              <p className="text-sm font-bold text-gray-800">
                {error.includes('صلاحيات') || error.toLowerCase().includes('permission') 
                  ? tr('تعذر الوصول للكاميرا. يرجى التأكد من منح الصلاحيات.', 'Unable to access camera. Please grant permission.')
                  : tr('لم نتمكن من القراءة', 'Could not read')}
              </p>
              <p className="text-[11px] text-gray-500 font-mono dir-ltr break-all">{error}</p>
              <div className="flex flex-wrap gap-2 justify-center pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5"
                >
                  <Camera size={14} />
                  {tr('استخدام كاميرا الهاتف الأساسية', 'Use Native Camera')}
                </button>
                <button
                  type="button"
                  onClick={() => { setError(''); setShowManualInput(true); }}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black"
                >
                  {tr('إدخال يدوي', 'Manual Input')}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2.5 rounded-xl bg-gray-200 text-gray-700 text-xs font-black"
                >
                  {tr('إغلاق', 'Close')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Input Panel */}
      {showManualInput && (
        <div className="shrink-0 bg-gray-900 px-4 py-3 border-t border-gray-700">
          <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
            <input
              ref={manualInputRef}
              type="text"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder={tr('أدخل الباركود يدوياً...', 'Enter barcode manually...')}
              className="flex-1 h-11 px-4 bg-gray-800 border border-gray-600 rounded-xl text-white text-sm font-bold outline-none focus:border-blue-400 dir-ltr"
              autoFocus
            />
            <button
              type="submit"
              className="h-11 px-5 bg-blue-600 text-white rounded-xl text-xs font-black shrink-0"
            >
              {tr('تأكيد', 'Submit')}
            </button>
          </form>
        </div>
      )}

      {/* Bottom Controls */}
      <div className="shrink-0 bg-black/95 px-4 py-4 safe-area-bottom">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Status text */}
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold text-white truncate">
              {title || (continuous
                ? tr('وجّه الكاميرا نحو الباركود — مسح مستمر', 'Point camera at barcode — continuous scan')
                : tr('وجّه الكاميرا نحو الباركود...', 'Point the camera at the barcode...'))}
            </p>
            {continuous && (
              <p className="text-[10px] text-blue-300 font-bold mt-0.5">
                {tr('سيتم إضافة كل صنف تلقائياً عند المسح', 'Each item will be added automatically on scan')}
              </p>
            )}
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Native Camera Capture Button (Crucial for iOS) */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 px-3 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white transition-all hover:bg-emerald-500 shadow-lg shadow-emerald-900/20"
              title={tr('التقاط صورة للكاميرا الأساسية', 'Native Camera')}
            >
              <Camera size={16} />
              <span className="text-[10px] font-black">{tr('تصوير دقيق', 'HQ Scan')}</span>
            </button>

            {/* Flashlight/Torch toggle */}
            <button
              type="button"
              onClick={toggleTorch}
              className={`h-10 w-10 flex items-center justify-center rounded-xl transition-all ${
                torchEnabled ? 'bg-yellow-500/80 text-white' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              title={tr('مصباح', 'Flashlight')}
            >
              <Flashlight size={16} />
            </button>

            {/* Sound toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(prev => !prev)}
              className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/10 text-white transition-all hover:bg-white/20"
              title={soundEnabled ? tr('كتم الصوت', 'Mute') : tr('تشغيل الصوت', 'Unmute')}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {/* Manual input toggle */}
            <button
              type="button"
              onClick={() => setShowManualInput(prev => !prev)}
              className={`h-10 w-10 flex items-center justify-center rounded-xl transition-all ${
                showManualInput ? 'bg-blue-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              title={tr('إدخال يدوي', 'Manual input')}
            >
              <Keyboard size={16} />
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              className="h-10 px-4 flex items-center justify-center gap-1.5 rounded-xl bg-white/15 text-white text-xs font-black transition-all hover:bg-white/25"
            >
              <X size={16} />
              <span>{continuous && scanCount > 0 ? tr('تم', 'Done') : tr('إغلاق', 'Close')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes barcode-scan-line {
          0%, 100% { top: 10%; }
          50% { top: 85%; }
        }
        @keyframes barcode-pop {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default BarcodeScannerModal;
