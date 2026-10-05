import { useCallback, useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'

const CACHE_PREFIX = 'mobile-bottom-nav:v1:'
export const MAX_CUSTOM_TABS = 3

type StoredValue = string[] | null

function readCache(userId: string | null | undefined): StoredValue {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + userId)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed === null) return null
    if (!Array.isArray(parsed)) return null
    return parsed.filter((x) => typeof x === 'string').slice(0, MAX_CUSTOM_TABS)
  } catch {
    return null
  }
}

function writeCache(userId: string, value: StoredValue) {
  try {
    localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

/**
 * Tùy chỉnh bottom nav lưu trên server tại `user_preferences.preferences.mobile_nav.selected_ids`.
 * LocalStorage chỉ là cache để first-paint không nháy.
 * - `selectedIds = null` => mặc định (filter theo permission).
 * - `selectedIds = string[]` => user đã cấu hình.
 */
export function useMobileNavPreferences() {
  const { user } = useUser()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()
  const queryKey = ['user-preferences', 'mobile-nav', userId] as const

  // Optimistic cache từ localStorage cho first paint
  const [localCache, setLocalCache] = useState<StoredValue>(() => readCache(userId))

  useEffect(() => {
    setLocalCache(readCache(userId))
  }, [userId])

  const { data: serverValue } = useQuery({
    queryKey,
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<StoredValue> => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      const ids = (data?.preferences as any)?.mobile_nav?.selected_ids
      if (!Array.isArray(ids)) return null
      const sanitized = ids.filter((x: unknown): x is string => typeof x === 'string').slice(0, MAX_CUSTOM_TABS)
      // Sync cache
      if (userId) writeCache(userId, sanitized)
      setLocalCache(sanitized)
      return sanitized
    },
  })

  const selectedIds: StoredValue = serverValue !== undefined ? serverValue : localCache

  const mutation = useMutation({
    mutationFn: async (value: StoredValue) => {
      if (!userId) throw new Error('No user')

      // Fetch existing preferences blob để merge
      const { data: row, error: readErr } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .maybeSingle()
      if (readErr) throw readErr

      const current = (row?.preferences as Record<string, any>) ?? {}
      const nextPrefs: Record<string, any> = {
        ...current,
        mobile_nav: value === null ? undefined : { selected_ids: value },
      }
      if (value === null) delete nextPrefs.mobile_nav

      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          { user_id: userId, preferences: nextPrefs },
          { onConflict: 'user_id' }
        )
      if (error) throw error
      return value
    },
    onMutate: async (value) => {
      if (userId) writeCache(userId, value)
      setLocalCache(value)
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<StoredValue>(queryKey)
      queryClient.setQueryData<StoredValue>(queryKey, value)
      return { prev }
    },
    onError: (_err, _value, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(queryKey, ctx.prev)
        if (userId) writeCache(userId, ctx.prev)
        setLocalCache(ctx.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const setSelectedIds = useCallback(
    (ids: string[]) => {
      mutation.mutate(ids.slice(0, MAX_CUSTOM_TABS))
    },
    [mutation]
  )

  const reset = useCallback(() => {
    mutation.mutate(null)
  }, [mutation])

  return {
    selectedIds,
    isCustomized: Array.isArray(selectedIds),
    setSelectedIds,
    reset,
    isSaving: mutation.isPending,
  }
}
