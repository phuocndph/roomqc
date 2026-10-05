/**
 * Global chunk-load error handler.
 *
 * Khi deploy bản mới, index.html cũ (đang cache trong SW hoặc browser) vẫn
 * tham chiếu tới các chunk JS với hash filename đã bị xóa. Lazy `import()`
 * sẽ ném lỗi dạng:
 *   - "Failed to fetch dynamically imported module"
 *   - "Importing a module script failed"
 *   - "Loading chunk X failed"
 *
 * Handler này bắt lỗi đó, dọn SW + caches rồi hard reload — tối đa 1 lần
 * mỗi session để tránh loop nếu lỗi do nguyên nhân khác.
 */

const RELOAD_FLAG = '__chunk_reload_attempted__';

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed|error loading dynamically imported module/i;

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    typeof err === 'string'
      ? err
      : (err as any)?.message ?? (err as any)?.reason?.message ?? '';
  return typeof msg === 'string' && CHUNK_ERROR_RE.test(msg);
}

export async function purgeCachesAndReload(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch (e) {
    console.warn('[chunk-reload] caches.delete failed:', e);
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) {
    console.warn('[chunk-reload] SW unregister failed:', e);
  }
  // Cache-bust query string để browser bypass HTTP cache cho index.html
  const url = new URL(window.location.href);
  url.searchParams.set('__r', Date.now().toString());
  window.location.replace(url.toString());
}

let installed = false;

export function installChunkReloadHandler(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const handle = (err: unknown) => {
    if (!isChunkLoadError(err)) return false;
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) {
        console.warn('[chunk-reload] Đã reload 1 lần, hiển thị fallback UI.');
        return false;
      }
      sessionStorage.setItem(RELOAD_FLAG, '1');
    } catch {
      /* sessionStorage có thể bị chặn — vẫn cứ reload */
    }
    console.warn('[chunk-reload] Phát hiện chunk lỗi, đang dọn cache & reload…');
    purgeCachesAndReload();
    return true;
  };

  window.addEventListener('error', (e) => {
    handle(e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    handle(e.reason);
  });
}

export function hasReloadAttempted(): boolean {
  try {
    return !!sessionStorage.getItem(RELOAD_FLAG);
  } catch {
    return false;
  }
}
