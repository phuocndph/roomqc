import i18n, { type BackendModule, type ReadCallback } from 'i18next';
import { initReactI18next } from 'react-i18next';

// === Vietnamese-only configuration ===
// Bundle các namespace dùng nhiều ngay từ đầu để tránh nháy key code khi
// điều hướng. Các namespace lớn hơn / ít dùng vẫn lazy-load.

import viCommon from './locales/vi/common.json';
import viAuth from './locales/vi/auth.json';
import viNavigation from './locales/vi/navigation.json';
import viDashboard from './locales/vi/dashboard.json';
import viRooms from './locales/vi/rooms.json';
import viInventory from './locales/vi/inventory.json';
import viItems from './locales/vi/items.json';
import viSettings from './locales/vi/settings.json';
import viNotifications from './locales/vi/notifications.json';
import viLanding from './locales/vi/landing.json';

// Lazy registry chỉ giữ namespace chưa bundle sẵn; loại các file eager khỏi
// glob để Vite không phát sinh dynamic-import warning và chunk dư thừa.
const lazyResources = import.meta.glob([
  './locales/vi/*.json',
  '!./locales/vi/common.json',
  '!./locales/vi/auth.json',
  '!./locales/vi/navigation.json',
  '!./locales/vi/dashboard.json',
  '!./locales/vi/rooms.json',
  '!./locales/vi/inventory.json',
  '!./locales/vi/items.json',
  '!./locales/vi/settings.json',
  '!./locales/vi/notifications.json',
  '!./locales/vi/landing.json',
]) as Record<
  string,
  () => Promise<{ default: Record<string, unknown> }>
>;

const EAGER_KEYS = new Set([
  './locales/vi/common.json',
  './locales/vi/auth.json',
  './locales/vi/navigation.json',
  './locales/vi/dashboard.json',
  './locales/vi/rooms.json',
  './locales/vi/inventory.json',
  './locales/vi/items.json',
  './locales/vi/settings.json',
  './locales/vi/notifications.json',
  './locales/vi/landing.json',
]);

const inflight = new Map<string, Promise<Record<string, unknown> | null>>();

async function loadResource(language: string, namespace: string) {
  if (language !== 'vi') return null;
  const key = `./locales/vi/${namespace}.json`;
  if (EAGER_KEYS.has(key)) return null;
  const loader = lazyResources[key];
  if (!loader) return null;
  let p = inflight.get(key);
  if (!p) {
    p = loader()
      .then((m) => m.default)
      .catch((err) => {
        console.warn('[i18n] Failed to load namespace:', key, err);
        inflight.delete(key);
        return null;
      });
    inflight.set(key, p);
  }
  return p;
}

const lazyBackend: BackendModule = {
  type: 'backend',
  init: () => {
    /* no-op */
  },
  read: (language: string, namespace: string, callback: ReadCallback) => {
    loadResource(language, namespace)
      .then((data) => {
        if (data) callback(null, data);
        else callback(null, {} as never);
      })
      .catch((err) => callback(err as Error, null));
  },
};

// Dọn localStorage cũ nếu user trước đó từng được set sang 'en'.
try {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage?.getItem('i18nextLng');
    if (stored && stored !== 'vi') {
      window.localStorage.setItem('i18nextLng', 'vi');
    }
  }
} catch {
  /* ignore */
}

i18n
  .use(lazyBackend)
  .use(initReactI18next)
  .init({
    lng: 'vi',
    fallbackLng: 'vi',
    supportedLngs: ['vi'],
    nonExplicitSupportedLngs: false,
    load: 'languageOnly',
    partialBundledLanguages: true,
    resources: {
      vi: {
        common: viCommon,
        auth: viAuth,
        navigation: viNavigation,
        dashboard: viDashboard,
        rooms: viRooms,
        inventory: viInventory,
        items: viItems,
        settings: viSettings,
        notifications: viNotifications,
        landing: viLanding,
      },
    },
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    react: {
      useSuspense: false,
    },
    saveMissing: false,
    initImmediate: false,
  });

export default i18n;
