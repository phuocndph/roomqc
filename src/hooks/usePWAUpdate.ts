import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';
import { shouldEnablePWA, cleanupServiceWorkers } from '@/lib/pwa-environment';

const UPDATE_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes

export function usePWAUpdate() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pwaEnabled = shouldEnablePWA();

  // Trên preview / iframe / localhost: không đăng ký SW, đồng thời cleanup
  // sạch SW + caches cũ. Dùng noop registration để hook vẫn an toàn.
  useEffect(() => {
    if (pwaEnabled) return;
    let cancelled = false;
    (async () => {
      const didCleanup = await cleanupServiceWorkers();
      if (!cancelled && didCleanup) {
        // Reload 1 lần để thoát khỏi controller cũ đang serve cache
        const FLAG = '__pwa_cleanup_reloaded__';
        if (!sessionStorage.getItem(FLAG)) {
          sessionStorage.setItem(FLAG, '1');
          window.location.reload();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pwaEnabled]);

  // The SW callback can run more than once during a hot reload or re-register.
  // Keep one timer and always release it when the provider unmounts.
  useEffect(() => () => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: pwaEnabled,
    onRegistered(registration) {
      if (!pwaEnabled) return;
      registrationRef.current = registration || null;
      if (registration) {
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = setInterval(() => {
          registration.update();
        }, UPDATE_CHECK_INTERVAL);
      }
    },
    onRegisterError(error) {
      console.error('[PWA] SW registration error:', error);
    },
    onNeedRefresh() {
    },
    onOfflineReady() {
    },
  });

  // Auto-reload when new SW takes control
  useEffect(() => {
    if (!pwaEnabled) return;
    const handleControllerChange = () => {
      toast.info('Đang cập nhật phiên bản mới...', { duration: 2000 });
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    };

    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [pwaEnabled]);

  // Check for updates when user returns to tab
  useEffect(() => {
    if (!pwaEnabled) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && registrationRef.current) {
        registrationRef.current.update();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pwaEnabled]);

  const update = async () => {
    if (!pwaEnabled) return;
    await updateServiceWorker(true);
  };

  const dismiss = () => {
    setNeedRefresh(false);
  };

  const checkForUpdate = async () => {
    if (!pwaEnabled) return;
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.update();
  };

  return {
    needRefresh: pwaEnabled ? needRefresh : false,
    offlineReady: pwaEnabled ? offlineReady : false,
    update,
    dismiss,
    checkForUpdate,
  };
}
