# PWA & Offline

## Service Worker
File: `src/sw.ts`. Strategies:
- App shell: cache-first
- API GET: network-first, fallback cache
- Static assets: stale-while-revalidate
- Offline page: `/offline`

## Cache busting
Memory `pwa/cache-busting-v1`:
- `CacheBuster` component check version mỗi 5 phút
- `<meta http-equiv="Cache-Control" content="no-cache">` ở index.html
- Bump `CURRENT_VERSION` ở `lib/app-version.ts` mỗi release để fix iOS PWA stuck

## Manifest
`public/manifest.webmanifest` — name, icons, theme_color, display=standalone, orientation=portrait.

## Install prompt
Page `/install` hướng dẫn cài đặt PWA cho từng OS (iOS Safari, Android Chrome).

## Offline tolerance
Theo project rule: flow hiện trường có draft 24h trong IndexedDB:
- Room Check Lean: `useLeanDraft` autosave mỗi 5s, restore khi quay lại
- Booking form: draft local trước submit
- Photo upload: queue retry khi online

## Credential caching
Memory `pwa-credential-management-spec`:
- IndexedDB encrypted storage
- Auto-login sau khi restart PWA
- Re-validate khi online

## Push notifications
- Subscribe khi user enable trong `/settings/notifications`
- Endpoint lưu `push_subscriptions`
- Send qua edge fn `send-push-notification` (Web Push protocol)

## Update flow
1. SW detect new version → fetch
2. `CacheBuster` notify user
3. User confirm → `skipWaiting` + reload
