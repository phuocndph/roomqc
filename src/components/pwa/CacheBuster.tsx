import { useEffect } from 'react';
import { APP_VERSION } from '@/lib/app-version';
import { isPreviewOrIframe, cleanupServiceWorkers } from '@/lib/pwa-environment';

/**
 * CacheBuster — force-clear stale caches & service workers.
 *
 * - Trên preview / iframe / localhost: LUÔN cleanup mỗi lần load.
 * - Trên production: chỉ cleanup khi version thay đổi, sau đó hard reload.
 *
 * Toàn bộ tác vụ chạy trong `requestIdleCallback` để KHÔNG cạnh tranh CPU
 * với render đầu (giúp LCP/TTI nhanh hơn).
 */
const CURRENT_VERSION = APP_VERSION;
const STORAGE_KEY = 'app_version';
const PREVIEW_RELOAD_FLAG = '__cachebuster_preview_reloaded__';

const runWhenIdle = (cb: () => void) => {
  if (typeof window === 'undefined') return () => {};
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) {
    const handle = ric(cb, { timeout: 2500 });
    return () => (window as any).cancelIdleCallback?.(handle);
  }
  const t = window.setTimeout(cb, 1500);
  return () => window.clearTimeout(t);
};

export function CacheBuster() {
  useEffect(() => {
    let cancelled = false;

    const cancelIdle = runWhenIdle(async () => {
      try {
        if (isPreviewOrIframe()) {
          const didCleanup = await cleanupServiceWorkers();
          if (cancelled) return;
          if (didCleanup && !sessionStorage.getItem(PREVIEW_RELOAD_FLAG)) {
            sessionStorage.setItem(PREVIEW_RELOAD_FLAG, '1');
            window.location.reload();
          }
          return;
        }

        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === CURRENT_VERSION) return;

        await cleanupServiceWorkers();
        if (cancelled) return;

        localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
        window.location.reload();
      } catch (err) {
        console.error('[CacheBuster] Failed:', err);
        try {
          localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
        } catch {
          /* ignore */
        }
      }
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []);

  return null;
}
