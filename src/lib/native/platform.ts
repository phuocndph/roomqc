import { Capacitor } from '@capacitor/core'

export const isNativeApp = () => Capacitor.isNativePlatform()

/** The public website, never the WebView's capacitor://localhost. */
export function nativePublicOrigin(): string {
  const value = String(import.meta.env.VITE_ROOMQC_PUBLIC_WEB_URL || '').trim()
  if (!value) throw new Error('Bản mobile chưa được cấu hình địa chỉ máy chủ RoomQC.')
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw new Error('Địa chỉ máy chủ mobile không hợp lệ.')
  return url.origin
}
