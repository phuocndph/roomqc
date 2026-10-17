import { MutationCache, onlineManager, type MutationObserverOptions } from '@tanstack/react-query'
import { isNativeApp } from './platform'

export function nativeMutationDefaults(): MutationObserverOptions {
  return isNativeApp() ? { networkMode: 'always', retry: false } : {}
}

export function createRoomQcMutationCache(): MutationCache {
  return new MutationCache({
    onMutate: () => {
      if (isNativeApp() && !onlineManager.isOnline()) throw new Error('Đang mất kết nối mạng. Vui lòng kết nối lại rồi thực hiện thao tác.')
    },
  })
}
