/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

// Precache build assets (JS/CSS hashed) — KHÔNG bao gồm index.html.
// Lọc thêm ở runtime để dù manifest có lọt index.html / changelog.json
// thì cũng không được đưa vào precache (gây stuck app shell cũ trên PWA).
const manifest = (self.__WB_MANIFEST || []).filter((entry) => {
  const url = typeof entry === 'string' ? entry : entry.url;
  if (!url) return false;
  if (/(^|\/)index\.html$/i.test(url)) return false;
  if (/changelog\.json$/i.test(url)) return false;
  return true;
});
precacheAndRoute(manifest);
cleanupOutdatedCaches();

// Navigation requests (HTML shell): LUÔN ưu tiên network để PWA nhận
// index.html mới (tham chiếu chunk JS mới) ngay khi có deploy mới.
// Chỉ fallback cache khi offline thật sự.
const navigationRoute = new NavigationRoute(
  new NetworkFirst({
    cacheName: 'html-shell-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  }),
  {
    denylist: [/^\/~oauth/, /^\/assets\//, /\.[a-z0-9]+$/i],
  }
);
registerRoute(navigationRoute);

// Always fetch changelog.json fresh — never cache (so users see latest release notes)
registerRoute(
  /\/changelog\.json/,
  new NetworkOnly()
);


// Never cache Supabase REST responses. Authorization headers are not part of
// the browser cache key, so a shared device could otherwise receive another
// user's tenant data during an offline fallback.

// Cache i18n JSON namespace lazy (StaleWhileRevalidate) — PWA cold start không phải fetch lại.
registerRoute(
  ({ url }) => /\/locales\/vi\/.+\.json$/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'i18n-vi-cache',
    networkTimeoutSeconds: 2,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 40,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 ngày
      }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
);

// Cache images
registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  })
);

// =============================================
// Push Notification Handling
// =============================================

interface PushPayload {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  notification_type?: string;
  data?: {
    url?: string;
    type?: string;
    [key: string]: unknown;
  };
}

// Vietnamese action buttons based on notification type
type NotificationActions = { action: string; title: string }[];

const NOTIFICATION_ACTIONS: Record<string, NotificationActions> = {
  low_stock: [
    { action: 'view', title: '📦 Xem kho' },
    { action: 'order', title: '🛒 Đặt hàng' },
  ],
  critical_stock: [
    { action: 'view', title: '🚨 Xem ngay' },
    { action: 'order', title: '🛒 Đặt hàng gấp' },
  ],
  maintenance_new: [
    { action: 'view', title: '🔧 Xem yêu cầu' },
    { action: 'assign', title: '👤 Phân công' },
  ],
  maintenance_completed: [
    { action: 'view', title: '✅ Xem chi tiết' },
    { action: 'close', title: '❌ Đóng' },
  ],
  laundry_completed: [
    { action: 'view', title: '👕 Xem chi tiết' },
    { action: 'receive', title: '📥 Nhận đồ' },
  ],
  po_pending_approval: [
    { action: 'approve', title: '✅ Phê duyệt' },
    { action: 'view', title: '📋 Xem đơn' },
  ],
  po_approved: [
    { action: 'view', title: '📋 Xem đơn' },
    { action: 'close', title: '❌ Đóng' },
  ],
  task_assigned: [
    { action: 'accept', title: '✅ Nhận việc' },
    { action: 'view', title: '📋 Xem chi tiết' },
  ],
  room_check_completed: [
    { action: 'view', title: '🏨 Xem phòng' },
    { action: 'close', title: '❌ Đóng' },
  ],
  default: [
    { action: 'open', title: '👁️ Xem ngay' },
    { action: 'dismiss', title: '❌ Bỏ qua' },
  ],
};

function getActionsForType(notificationType?: string): NotificationActions {
  if (!notificationType) return NOTIFICATION_ACTIONS.default;
  return NOTIFICATION_ACTIONS[notificationType] || NOTIFICATION_ACTIONS.default;
}

self.addEventListener('push', (event: PushEvent) => {
  console.log('[SW] ========= PUSH EVENT RECEIVED =========');
  console.log('[SW] Event:', event);
  console.log('[SW] Event data exists:', !!event.data);
  
  if (event.data) {
    console.log('[SW] Raw data text:', event.data.text());
  }

  let notificationData: PushPayload = {
    title: 'RoomQc',
    body: 'Bạn có thông báo mới',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    tag: 'default',
    notification_type: 'default',
    data: { url: '/' },
  };

  if (event.data) {
    try {
      const payload = event.data.json() as PushPayload;
      notificationData = {
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        icon: payload.icon || notificationData.icon,
        badge: payload.badge || notificationData.badge,
        image: payload.image,
        tag: payload.tag || notificationData.tag,
        notification_type: payload.notification_type || payload.data?.type || 'default',
        data: payload.data || notificationData.data,
      };
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
      notificationData.body = event.data.text();
    }
  }

  const notificationType = notificationData.notification_type || 'default';
  const actions = getActionsForType(notificationType);

  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    image: notificationData.image,
    tag: notificationData.tag,
    data: notificationData.data,
    vibrate: [100, 50, 100],
    requireInteraction: true,
    silent: false,
    actions,
  } as NotificationOptions & { 
    vibrate?: number[]; 
    image?: string; 
    actions?: { action: string; title: string }[];
  };

  console.log('[SW] Showing notification:', {
    title: notificationData.title,
    type: notificationType,
    actions: actions.map(a => a.title),
  });

  event.waitUntil(
    self.registration.showNotification(notificationData.title!, options)
      .then(() => {
        console.log('[SW] ✅ Thông báo hiển thị thành công!');
      })
      .catch((err) => {
        console.error('[SW] ❌ Lỗi hiển thị thông báo:', err);
      })
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  console.log('[SW] Notification clicked:', event);

  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const rawUrl = (event.notification.data?.url as string) || '/';
  let urlToOpen = rawUrl;
  try {
    // If URL is already absolute (starts with http), use it directly
    // This preserves the correct domain (id-preview-- for Preview, live domain for Live)
    if (rawUrl.startsWith('http')) {
      urlToOpen = rawUrl;
    } else {
      // If relative, resolve with current origin
      urlToOpen = new URL(rawUrl, self.location.origin).toString();
    }
  } catch {
    urlToOpen = new URL('/', self.location.origin).toString();
  }
  const urlParsed = new URL(urlToOpen);
  const shouldNavigate = urlParsed.pathname !== '/' || !!urlParsed.search || !!urlParsed.hash;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            if (shouldNavigate) (client as WindowClient).navigate(urlToOpen);
            return;
          }
        }
        // Open new window if none exists
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', (event: NotificationEvent) => {
  console.log('[SW] Notification closed:', event);
});

// Handle push subscription change
interface ExtendedPushSubscriptionChangeEvent extends Event {
  oldSubscription?: PushSubscription;
  newSubscription?: PushSubscription;
  waitUntil(promise: Promise<unknown>): void;
}

self.addEventListener('pushsubscriptionchange', (event: Event) => {
  console.log('[SW] Push subscription changed:', event);

  const pushEvent = event as ExtendedPushSubscriptionChangeEvent;
  
  pushEvent.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: pushEvent.oldSubscription?.options?.applicationServerKey,
      })
      .then((subscription) => {
        console.log('[SW] New subscription:', subscription);
        // The main app will handle re-registration on next load
      })
      .catch((error) => {
        console.error('[SW] Failed to resubscribe:', error);
      })
  );
});

// Handle message from main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
   
  if (event.data?.type === 'SKIP_WAITING') {
     console.log('[SW] SKIP_WAITING received, activating...');
    self.skipWaiting();
  }
   
   // Force reload all clients (for critical updates)
   if (event.data?.type === 'FORCE_RELOAD') {
     console.log('[SW] FORCE_RELOAD received, reloading all clients...');
     self.clients.matchAll({ type: 'window' }).then(clients => {
       clients.forEach(client => {
         (client as WindowClient).navigate(client.url);
       });
     });
   }
});

// Skip waiting and claim clients immediately
self.skipWaiting();
self.clients.claim();

console.log('[SW] ✅ Service Worker loaded with push notification support!');
