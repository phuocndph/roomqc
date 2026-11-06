import type { RealtimeChannel, RealtimePostgresChangesFilter } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

type RealtimePayload = any

interface Entry {
  channel: RealtimeChannel
  listeners: Set<(payload: RealtimePayload) => void>
  refCount: number
}

const entries = new Map<string, Entry>()

/** Register callbacks before subscribe() and share one channel per name. */
export function subscribeSharedPostgresChanges(
  channelName: string,
  filter: RealtimePostgresChangesFilter<'*'>,
  listener: (payload: RealtimePayload) => void,
): () => void {
  let entry = entries.get(channelName)
  if (!entry) {
    const listeners = new Set<(payload: RealtimePayload) => void>()
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', filter, payload => {
        for (const callback of Array.from(listeners)) callback(payload)
      })
    entry = { channel, listeners, refCount: 0 }
    entries.set(channelName, entry)
    channel.subscribe()
  }

  entry.listeners.add(listener)
  entry.refCount += 1
  let active = true
  return () => {
    if (!active) return
    active = false
    const current = entries.get(channelName)
    if (!current) return
    current.listeners.delete(listener)
    current.refCount = Math.max(0, current.refCount - 1)
    if (current.refCount === 0) {
      entries.delete(channelName)
      void supabase.removeChannel(current.channel)
    }
  }
}
