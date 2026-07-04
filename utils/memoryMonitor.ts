import { useEffect, useRef } from 'react';

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  usagePercentage: number;
  available: boolean;
}

export function getMemoryInfo(): MemoryInfo {
  if (typeof performance === 'undefined' || !(performance as any).memory) {
    return {
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0,
      usagePercentage: 0,
      available: false
    };
  }

  const memory = (performance as any).memory;
  const usedJSHeapSize = memory.usedJSHeapSize || 0;
  const jsHeapSizeLimit = memory.jsHeapSizeLimit || 0;
  const usagePercentage = jsHeapSizeLimit > 0
    ? (usedJSHeapSize / jsHeapSizeLimit) * 100
    : 0;

  return {
    usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize || 0,
    jsHeapSizeLimit,
    usagePercentage,
    available: true
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function checkMemoryThreshold(warningThreshold = 80, criticalThreshold = 90): {
  level: 'OK' | 'WARNING' | 'CRITICAL';
  info: MemoryInfo;
} {
  const info = getMemoryInfo();

  if (!info.available) {
    return { level: 'OK', info };
  }

  if (info.usagePercentage >= criticalThreshold) {
    return { level: 'CRITICAL', info };
  } else if (info.usagePercentage >= warningThreshold) {
    return { level: 'WARNING', info };
  } else {
    return { level: 'OK', info };
  }
}

export function logMemoryStats(label = 'Memory'): void {
  const info = getMemoryInfo();

  if (!info.available) {
    console.log(`[${label}] Memory API not available`);
    return;
  }

  console.log(
    `[${label}] Used: ${formatBytes(info.usedJSHeapSize)} / ${formatBytes(info.jsHeapSizeLimit)} (${info.usagePercentage.toFixed(1)}%)`
  );
}

export function useMemoryMonitor(options: {
  enabled?: boolean;
  interval?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  onWarning?: (info: MemoryInfo) => void;
  onCritical?: (info: MemoryInfo) => void;
} = {}): MemoryInfo {
  const {
    enabled = true,
    interval = 10000,
    warningThreshold = 80,
    criticalThreshold = 90,
    onWarning,
    onCritical
  } = options;

  const lastWarningRef = useRef(0);
  const lastCriticalRef = useRef(0);
  const memoryInfoRef = useRef<MemoryInfo>(getMemoryInfo());

  useEffect(() => {
    if (!enabled) return;

    const checkMemory = () => {
      const result = checkMemoryThreshold(warningThreshold, criticalThreshold);
      memoryInfoRef.current = result.info;

      const now = Date.now();

      if (result.level === 'CRITICAL') {
        if (now - lastCriticalRef.current > 30000) {
          console.error(
            `[Memory Monitor] CRITICAL: Memory usage at ${result.info.usagePercentage.toFixed(1)}% (${formatBytes(result.info.usedJSHeapSize)} / ${formatBytes(result.info.jsHeapSizeLimit)})`
          );
          lastCriticalRef.current = now;
          onCritical?.(result.info);
        }
      } else if (result.level === 'WARNING') {
        if (now - lastWarningRef.current > 60000) {
          console.warn(
            `[Memory Monitor] WARNING: Memory usage at ${result.info.usagePercentage.toFixed(1)}% (${formatBytes(result.info.usedJSHeapSize)} / ${formatBytes(result.info.jsHeapSizeLimit)})`
          );
          lastWarningRef.current = now;
          onWarning?.(result.info);
        }
      }
    };

    checkMemory();
    const timerId = setInterval(checkMemory, interval);

    return () => clearInterval(timerId);
  }, [enabled, interval, warningThreshold, criticalThreshold, onWarning, onCritical]);

  return memoryInfoRef.current;
}

export function memoryBudgetAvailable(minPercentageFree = 20): boolean {
  const info = getMemoryInfo();

  if (!info.available) {
    return true;
  }

  const percentageFree = 100 - info.usagePercentage;
  return percentageFree >= minPercentageFree;
}
