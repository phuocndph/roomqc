/**
 * Helpers để quyết định có nên kích hoạt Service Worker / PWA hay không.
 *
 * Lý do tồn tại: editor preview của Lovable nhúng app trong iframe + dùng
 * domain `id-preview--*.lovable.app`. Service Worker đăng ký trong các môi
 * trường này sẽ giữ cache app shell rất "lì", khiến người dùng thấy bản cũ
 * sau mỗi lần sửa code (chỉ Visual Edits force reload iframe mới thoát).
 *
 * → Trên preview / iframe / localhost: TẮT SW, đồng thời cleanup bất kỳ
 *   SW + Cache Storage cũ nào còn sót lại từ những lần truy cập trước.
 * → Trên production (custom domain hoặc *.lovable.app không phải preview):
 *   SW vẫn hoạt động bình thường, PWA install + offline đầy đủ.
 */

export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Bị block do cross-origin → coi như iframe để an toàn
    return true;
  }
}

export function isPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host.includes('id-preview--') ||
    host.includes('lovableproject.com') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
}

export function isPreviewOrIframe(): boolean {
  return isInIframe() || isPreviewHost();
}

export function shouldEnablePWA(): boolean {
  return !isPreviewOrIframe();
}

/**
 * App đang chạy ở chế độ standalone (đã "Add to Home Screen" / cài PWA).
 * Dùng để bật auto-login: chỉ máy cá nhân đã cài app mới tự đăng nhập.
 */
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const mql = window.matchMedia?.('(display-mode: standalone)');
    if (mql?.matches) return true;
  } catch {
    // ignore
  }
  // iOS Safari
  if ((window.navigator as any).standalone === true) return true;
  return false;
}

/**
 * Gỡ bỏ mọi Service Worker + Cache Storage còn sót. Dùng trên preview/iframe
 * để đảm bảo bản code mới luôn được fetch tươi.
 */
export async function cleanupServiceWorkers(): Promise<boolean> {
  let didCleanup = false;
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length > 0) {
        await Promise.all(regs.map((r) => r.unregister()));
        didCleanup = true;
      }
    }
    if ('caches' in window) {
      const names = await caches.keys();
      if (names.length > 0) {
        await Promise.all(names.map((n) => caches.delete(n)));
        didCleanup = true;
      }
    }
  } catch (err) {
    console.error('[PWA-Cleanup] Failed:', err);
  }
  return didCleanup;
}
