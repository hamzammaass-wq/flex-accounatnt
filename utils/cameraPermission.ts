import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';

/**
 * Checks and requests camera permissions on Capacitor (Android/iOS) and Web browser.
 * Returns true if camera permission is granted.
 */
export const ensureCameraPermission = async (tr: (ar: string, en: string) => string): Promise<boolean> => {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Camera.checkPermissions();
      if (status.camera === 'granted') {
        return true;
      }
      
      const request = await Camera.requestPermissions({ permissions: ['camera'] });
      if (request.camera === 'granted') {
        return true;
      }
      
      alert(tr(
        'يرجى منح صلاحية الوصول للكاميرا من إعدادات الهاتف لتتمكن من مسح الباركود.',
        'Please grant camera permission in your phone settings to scan barcodes.'
      ));
      return false;
    } catch (error: any) {
      console.error('[Camera Permission] Failed to request native permission:', error);
      alert(tr(
        'حدث خطأ أثناء طلب إذن الكاميرا: ' + (error?.message || error),
        'Error requesting camera permission: ' + (error?.message || error)
      ));
      return false;
    }
  } else {
    // Browser environment
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert(tr(
        'متصفحك لا يدعم فتح الكاميرا، أو أن الموقع يعمل بدون اتصال آمن (يتطلب HTTPS للوصول للكاميرا).',
        'Camera access is not supported by this browser, or connection is not secure (HTTPS required for camera access).'
      ));
      return false;
    }

    // Try to query permission status first if supported, to avoid turning on/off the camera unnecessarily
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (permissionStatus.state === 'granted') {
          return true;
        } else if (permissionStatus.state === 'denied') {
          alert(tr(
            'يرجى منح صلاحية الوصول للكاميرا من إعدادات المتصفح لتتمكن من مسح الباركود.',
            'Please grant camera permission in your browser settings to scan barcodes.'
          ));
          return false;
        }
      } catch (e) {
        // Fall back to requesting user media directly if query is not supported
      }
    }

    try {
      // Trigger a temporary getUserMedia stream within the user gesture context to request/verify permissions.
      // We use a generic video: true constraint to avoid OverconstrainedError on devices without an environment camera.
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Stop all tracks immediately so the camera indicator goes off and resources are freed.
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error: any) {
      console.error('[Camera Permission] Failed to request browser permission:', error);
      alert(tr(
        'يرجى منح صلاحية الوصول للكاميرا من إعدادات المتصفح لتتمكن من مسح الباركود.',
        'Please grant camera permission in your browser settings to scan barcodes.'
      ));
      return false;
    }
  }
  return true;
};
