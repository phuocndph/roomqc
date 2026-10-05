import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUser } from '@/hooks/useUser';
import { toast } from 'sonner';

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() ?? '';
const SERVICE_WORKER_READY_TIMEOUT_MS = 12_000;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getApplicationServerKey(): Uint8Array {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('VAPID_NOT_CONFIGURED');
  }

  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  if (key.length !== 65 || key[0] !== 0x04) {
    throw new Error('VAPID_INVALID');
  }
  return key;
}

function applicationServerKeysMatch(
  currentKey: ArrayBuffer | null,
  configuredKey: Uint8Array
): boolean {
  if (!currentKey) return false;

  const current = new Uint8Array(currentKey);
  if (current.length !== configuredKey.length) return false;
  return current.every((value, index) => value === configuredKey[index]);
}

function getPushSupportError(): string | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Thông báo đẩy chỉ hoạt động trong trình duyệt.';
  }
  if (!window.isSecureContext) {
    return 'Thông báo đẩy cần HTTPS (localhost vẫn được hỗ trợ khi chạy local).';
  }
  if (!('Notification' in window)) {
    return 'Trình duyệt này không hỗ trợ thông báo.';
  }
  if (!('serviceWorker' in navigator)) {
    return 'Trình duyệt này không hỗ trợ service worker.';
  }
  if (!('PushManager' in window)) {
    return 'Trình duyệt này không hỗ trợ Web Push.';
  }
  if (!VAPID_PUBLIC_KEY) {
    return 'Hệ thống chưa được cấu hình khóa Web Push (VAPID).';
  }

  try {
    getApplicationServerKey();
  } catch {
    return 'Khóa Web Push (VAPID) không hợp lệ.';
  }
  return null;
}

async function getReadyServiceWorker(): Promise<ServiceWorkerRegistration> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error('SERVICE_WORKER_TIMEOUT')),
      SERVICE_WORKER_READY_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function getPushErrorMessage(error: unknown): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  const name = typeof record?.name === 'string' ? record.name : '';
  const code = typeof record?.code === 'string' ? record.code : '';
  const message = error instanceof Error
    ? error.message
    : typeof record?.message === 'string'
      ? record.message
      : String(error ?? '');

  if (message.includes('VAPID_NOT_CONFIGURED')) {
    return 'Hệ thống chưa được cấu hình khóa Web Push (VAPID).';
  }
  if (message.includes('VAPID_INVALID') || /applicationServerKey|vapid/i.test(message)) {
    return 'Khóa Web Push không hợp lệ. Vui lòng kiểm tra cấu hình VAPID.';
  }
  if (message.includes('SERVICE_WORKER_TIMEOUT')) {
    return 'Service worker chưa sẵn sàng. Hãy tải lại trang rồi thử lại.';
  }
  if (name === 'NotAllowedError' || /permission|denied|blocked/i.test(message)) {
    return 'Trình duyệt đang chặn thông báo. Hãy cho phép thông báo trong cài đặt trang.';
  }
  if (name === 'SecurityError' || /secure context|https/i.test(message)) {
    return 'Thông báo đẩy chỉ hoạt động trên HTTPS hoặc localhost.';
  }
  if (name === 'InvalidStateError') {
    return 'Đăng ký thông báo cũ không còn hợp lệ. Hãy tải lại trang rồi thử lại.';
  }
  if (name === 'InvalidAccessError' || name === 'TypeError') {
    return 'Trình duyệt từ chối khóa Web Push. Vui lòng kiểm tra cấu hình VAPID.';
  }
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'Không thể lưu thiết bị nhận thông báo do thiếu quyền cơ sở dữ liệu.';
  }
  if (/failed to fetch|network|connection|cors/i.test(message)) {
    return 'Không kết nối được máy chủ thông báo. Vui lòng kiểm tra Supabase.';
  }
  return 'Không thể bật thông báo trên trình duyệt này. Vui lòng thử lại sau.';
}

export interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permission: NotificationPermission;
  subscription: PushSubscription | null;
  error: string | null;
}

export function usePushNotifications() {
  const { user: authUser } = useAuth();
  const { tenantId } = useUser();
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isSubscribed: false,
    isLoading: true,
    permission: 'default',
    subscription: null,
    error: null,
  });

  const savedDbEndpointsRef = useRef<Set<string>>(new Set());

  const saveSubscriptionToDb = useCallback(
    async (subscription: PushSubscription, options?: { throwOnError?: boolean }) => {
      if (!authUser?.id || !tenantId) {
        const error = new Error('AUTH_CONTEXT_NOT_READY');
        if (options?.throwOnError) throw error;
        return;
      }

      const cacheKey = `${authUser.id}:${subscription.endpoint}`;
      if (!options?.throwOnError && savedDbEndpointsRef.current.has(cacheKey)) return;

      try {
        const p256dh = subscription.getKey('p256dh');
        const auth = subscription.getKey('auth');
        if (!p256dh || !auth) {
          throw new Error('Missing subscription keys');
        }

        const { error } = await supabase.from('push_subscriptions').upsert(
          {
            user_id: authUser.id,
            tenant_id: tenantId,
            endpoint: subscription.endpoint,
            p256dh_key: arrayBufferToBase64(p256dh),
            auth_key: arrayBufferToBase64(auth),
            device_name: getDeviceName(),
            user_agent: navigator.userAgent,
            is_active: true,
            failed_count: 0,
          },
          { onConflict: 'user_id,endpoint' }
        );

        if (error) throw error;
        savedDbEndpointsRef.current.add(cacheKey);
      } catch (error) {
        console.warn('[Push] Failed to persist subscription to DB:', error);
        if (options?.throwOnError) throw error;
      }
    },
    [authUser?.id, tenantId]
  );

  const checkSupport = useCallback(() => getPushSupportError() === null, []);

  const checkSubscription = useCallback(async () => {
    const supportError = getPushSupportError();
    if (supportError) {
      setState(prev => ({
        ...prev,
        isSupported: false,
        isSubscribed: false,
        isLoading: false,
        error: supportError,
      }));
      return;
    }

    try {
      const registration = await getReadyServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      const permission = Notification.permission;
      const isSubscribed = !!subscription && permission === 'granted';

      if (isSubscribed && subscription) {
        void saveSubscriptionToDb(subscription);
      }

      setState({
        isSupported: true,
        isSubscribed,
        isLoading: false,
        permission,
        subscription,
        error: null,
      });
    } catch (error) {
      const errorMessage = getPushErrorMessage(error);
      console.error('[Push] Error checking subscription:', error);
      setState(prev => ({
        ...prev,
        isSupported: checkSupport(),
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [checkSupport, saveSubscriptionToDb]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!authUser?.id || !tenantId) {
      toast.error('Vui lòng đăng nhập để bật thông báo.');
      return false;
    }

    const supportError = getPushSupportError();
    if (supportError) {
      toast.error(supportError);
      setState(prev => ({ ...prev, isSupported: false, isLoading: false, error: supportError }));
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        const errorMessage = permission === 'denied'
          ? 'Trình duyệt đang chặn thông báo. Hãy cho phép trong cài đặt trang.'
          : 'Bạn chưa cho phép nhận thông báo.';
        toast.error(errorMessage);
        setState(prev => ({ ...prev, isLoading: false, permission, error: errorMessage }));
        return false;
      }

      const applicationServerKey = getApplicationServerKey();
      const registration = await getReadyServiceWorker();

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      try {
        await registration.update();
      } catch (error) {
        console.warn('[Push] Service worker update check failed:', error);
      }

      let subscription = await registration.pushManager.getSubscription();
      if (
        subscription &&
        !applicationServerKeysMatch(subscription.options.applicationServerKey, applicationServerKey)
      ) {
        const staleEndpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await supabase
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('user_id', authUser.id)
          .eq('endpoint', staleEndpoint);
        subscription = null;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as BufferSource,
        });
      }

      await saveSubscriptionToDb(subscription, { throwOnError: true });

      setState({
        isSupported: true,
        isSubscribed: true,
        isLoading: false,
        permission: 'granted',
        subscription,
        error: null,
      });

      toast.success('Đã bật thông báo đẩy.');
      return true;
    } catch (error) {
      const errorMessage = getPushErrorMessage(error);
      console.error('[Push] Error subscribing:', error);
      toast.error(errorMessage);
      setState(prev => ({
        ...prev,
        isLoading: false,
        permission: Notification.permission,
        error: errorMessage,
      }));
      return false;
    }
  }, [authUser?.id, tenantId, saveSubscriptionToDb]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const registration = await getReadyServiceWorker();
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        if (authUser?.id) {
          const { error } = await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('user_id', authUser.id)
            .eq('endpoint', endpoint);
          if (error) console.warn('[Push] Failed to deactivate DB subscription:', error);
        }
      }

      setState(prev => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
        subscription: null,
        error: null,
      }));

      toast.success('Đã tắt thông báo đẩy.');
      return true;
    } catch (error) {
      const errorMessage = getPushErrorMessage(error);
      console.error('[Push] Error unsubscribing:', error);
      toast.error(errorMessage);
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      return false;
    }
  }, [authUser?.id]);

  function getDeviceName(): string {
    const ua = navigator.userAgent;

    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) {
      const match = ua.match(/Android.*?([^;]+)\)/);
      return match ? match[1].trim() : 'Android';
    }
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Linux/.test(ua)) return 'Linux';

    return 'Unknown Device';
  }

  useEffect(() => {
    void checkSubscription();
  }, [checkSubscription]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    checkSubscription,
  };
}
