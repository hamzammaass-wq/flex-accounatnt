import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';

export type DeviceClass = 'mobile' | 'tablet' | 'desktop';
export type LaunchMode = 'browser' | 'standalone';
export type ShellVariant = 'expanded' | 'centered';
export type OverlayVariant = 'bottom-sheet' | 'dialog' | 'fullscreen';

const MOBILE_MAX_WIDTH = 767;
const TABLET_MAX_WIDTH = 1199;

const getDeviceClass = (width: number): DeviceClass => {
  if (width <= MOBILE_MAX_WIDTH) return 'mobile';
  if (width <= TABLET_MAX_WIDTH) return 'tablet';
  return 'desktop';
};

const getLaunchMode = (): LaunchMode => {
  if (typeof window === 'undefined') return 'browser';
  const standaloneByMedia = window.matchMedia('(display-mode: standalone)').matches;
  const standaloneByNavigator = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return standaloneByMedia || standaloneByNavigator ? 'standalone' : 'browser';
};

const getShellVariant = (deviceClass: DeviceClass, launchMode: LaunchMode): ShellVariant => {
  if (launchMode === 'browser' && deviceClass !== 'mobile') return 'centered';
  return 'expanded';
};

const getOverlayVariant = (deviceClass: DeviceClass, launchMode: LaunchMode): OverlayVariant => {
  if (deviceClass === 'mobile') {
    return launchMode === 'standalone' ? 'fullscreen' : 'bottom-sheet';
  }
  if (deviceClass === 'tablet' && launchMode === 'standalone') return 'fullscreen';
  return 'dialog';
};

const getInitialWidth = () => (typeof window === 'undefined' ? 1200 : window.innerWidth);

export const useResponsiveMode = () => {
  const [windowWidth, setWindowWidth] = useState<number>(getInitialWidth);
  const [launchMode, setLaunchMode] = useState<LaunchMode>(getLaunchMode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setWindowWidth(window.innerWidth);
    const media = window.matchMedia('(display-mode: standalone)');
    const updateLaunchMode = () => setLaunchMode(getLaunchMode());

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('pageshow', updateLaunchMode);
    media.addEventListener('change', updateLaunchMode);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('pageshow', updateLaunchMode);
      media.removeEventListener('change', updateLaunchMode);
    };
  }, []);

  const deviceClass = useMemo(() => getDeviceClass(windowWidth), [windowWidth]);
  const isMobile = deviceClass === 'mobile';
  const isTablet = deviceClass === 'tablet';
  const isDesktop = deviceClass === 'desktop';
  const isStandalone = launchMode === 'standalone';

  const shellVariant = useMemo(
    () => getShellVariant(deviceClass, launchMode),
    [deviceClass, launchMode]
  );
  const overlayVariant = useMemo(
    () => getOverlayVariant(deviceClass, launchMode),
    [deviceClass, launchMode]
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.deviceClass = deviceClass;
    root.dataset.launchMode = launchMode;
    root.style.setProperty('--app-nav-height-mobile', '78px');
    root.style.setProperty('--app-nav-height-tablet', '86px');
    root.style.setProperty('--app-nav-height', deviceClass === 'mobile' ? '78px' : '86px');
    
    if (Capacitor.isNativePlatform()) {
      const isPortrait = typeof window !== 'undefined' && window.innerHeight >= window.innerWidth;
      root.style.setProperty('--app-safe-top', isPortrait ? '34px' : '0px');
      root.style.setProperty('--app-safe-bottom', '16px');
    } else {
      root.style.setProperty('--app-safe-top', 'env(safe-area-inset-top)');
      root.style.setProperty('--app-safe-bottom', 'env(safe-area-inset-bottom)');
    }
    
    root.style.setProperty('--app-content-max-width-tablet-browser', '1080px');
  }, [deviceClass, launchMode]);

  return {
    deviceClass,
    launchMode,
    isMobile,
    isTablet,
    isDesktop,
    isStandalone,
    shellVariant,
    overlayVariant
  };
};

export default useResponsiveMode;
