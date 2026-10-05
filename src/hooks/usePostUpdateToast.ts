import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * After a PWA update + reload, check if there was a pending version.
 * If so, show a success toast and clear the marker.
 */
export function usePostUpdateToast() {
  useEffect(() => {
    try {
      const pending = localStorage.getItem('pendingUpdateVersion');
      if (pending) {
        // Defer slightly so toast container is mounted
        const t = setTimeout(() => {
          toast.success(`Đã cập nhật lên v${pending} thành công`, {
            duration: 4000,
          });
          localStorage.removeItem('pendingUpdateVersion');
        }, 800);
        return () => clearTimeout(t);
      }
    } catch {
      // ignore storage errors
    }
  }, []);
}
