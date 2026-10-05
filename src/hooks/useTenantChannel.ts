import { useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

type PostgresChangeEvent = '*' | 'INSERT' | 'UPDATE' | 'DELETE'

export interface ChannelSubscription {
  /** Tên bảng cần lắng nghe */
  table: string
  /** Loại event */
  event?: PostgresChangeEvent
  /**
   * Filter phụ (vd: `assigned_to=eq.${userId}`).
   * Lưu ý: hệ thống sẽ TỰ ĐỘNG thêm `tenant_id=eq.${tenantId}` nếu chưa có filter,
   * nên thường không cần truyền filter này.
   */
  filter?: string
  /** Có nên auto-inject filter tenant_id hay không (mặc định true) */
  autoTenantFilter?: boolean
  /** Schema, mặc định public */
  schema?: string
  /** Callback khi có event */
  callback: (payload: any) => void
}

/**
 * Helper chuẩn hoá Supabase Realtime cho high-concurrency:
 * 1. Tự inject `tenant_id=eq.${tenantId}` filter (trừ khi đã có filter khác hoặc tắt).
 * 2. Pause subscribe khi tab ẩn, resume + invalidate khi visible trở lại.
 * 3. Cleanup tự động.
 *
 * @param channelName tên kênh (phải unique theo scope, vd: `bookings-${tenantId}`)
 * @param tenantId tenant scope; nếu null/undefined sẽ không subscribe
 * @param subscriptions mảng subscription
 * @param onResume callback chạy khi tab quay lại visible (thường để invalidate query)
 */
export function useTenantChannel(
  channelName: string,
  tenantId: string | undefined | null,
  subscriptions: ChannelSubscription[],
  onResume?: () => void
) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subsRef = useRef(subscriptions)
  const onResumeRef = useRef(onResume)

  // Cập nhật ref mà không trigger lại effect
  subsRef.current = subscriptions
  onResumeRef.current = onResume

  useEffect(() => {
    if (!tenantId) return

    let isActive = true

    const subscribe = () => {
      if (channelRef.current || !isActive) return

      const channel = supabase.channel(channelName)

      for (const sub of subsRef.current) {
        const useTenantFilter = sub.autoTenantFilter !== false
        const filter = sub.filter
          ? sub.filter
          : useTenantFilter
            ? `tenant_id=eq.${tenantId}`
            : undefined

        channel.on(
          'postgres_changes' as any,
          {
            event: sub.event ?? '*',
            schema: sub.schema ?? 'public',
            table: sub.table,
            ...(filter ? { filter } : {}),
          },
          sub.callback
        )
      }

      channel.subscribe()
      channelRef.current = channel
    }

    const unsubscribe = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        subscribe()
        onResumeRef.current?.()
      } else {
        unsubscribe()
      }
    }

    // Subscribe ngay nếu tab đang visible
    if (document.visibilityState === 'visible') {
      subscribe()
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      isActive = false
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribe()
    }
  }, [channelName, tenantId])
}
