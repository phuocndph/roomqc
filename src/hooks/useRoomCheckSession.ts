import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useUser } from '@/hooks/useUser'
import { getFriendlyError } from '@/lib/errorMessage'

export type RoomCheckType = 'daily' | 'periodic' | 'checkin' | 'checkout' | 'maintenance' | 'delivery' | 'replenish'

export interface RoomCheckSession {
  id: string
  room_id: string
  user_id: string
  user_name: string
  check_type: RoomCheckType
  started_at: string
}

// Helper to calculate session duration in minutes
export function getSessionDurationMinutes(startedAt: string): number {
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000)
}

// Format duration for display
export function formatSessionDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}p`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h${mins}p` : `${hours}h`
}

export function useRoomCheckSession(roomId: string | undefined) {
  const [session, setSession] = useState<RoomCheckSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const { tenantId } = useUser()

  useEffect(() => {
    if (!roomId) return

    const fetchSession = async () => {
      try {
        const { data, error } = await supabase
          .from('room_check_sessions')
          .select('*')
          .eq('room_id', roomId)
          .maybeSingle()

        if (error) throw error
        setSession(data ? {
          id: data.id,
          room_id: data.room_id,
          user_id: data.user_id,
          user_name: data.user_name,
          check_type: data.check_type as RoomCheckType,
          started_at: data.started_at
        } : null)
      } catch (error: any) {
        console.error('Error fetching check session:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSession()

    if (!tenantId) return

    // Subscribe to realtime updates — filter by tenant_id (Postgres realtime
    // supports a single filter); narrow to this room in the handler.
    const channel = supabase
      .channel(`room-check-session-${tenantId}-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_check_sessions',
          filter: `tenant_id=eq.${tenantId}`
        },
        (payload) => {
          const next = payload.new as any
          const prev = payload.old as any
          const affectedRoom = next?.room_id ?? prev?.room_id
          if (affectedRoom !== roomId) return

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setSession(next as RoomCheckSession)
          } else if (payload.eventType === 'DELETE') {
            setSession(null)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, tenantId])

  const createSession = async (
    roomId: string,
    checkType: RoomCheckType,
    userName: string,
    tenantId: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('room_check_sessions')
        .insert({
          room_id: roomId,
          user_id: user.id,
          user_name: userName,
          check_type: checkType,
          tenant_id: tenantId,
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          return null
        }
        throw error
      }

      return data
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
      return null
    }
  }

  const deleteSession = async (roomId: string) => {
    try {
      const { error } = await supabase
        .from('room_check_sessions')
        .delete()
        .eq('room_id', roomId)

      if (error) throw error
    } catch (error: any) {
      console.error('Error deleting check session:', error)
    }
  }

  // Manager override: xóa session của người khác và tạo session mới
  const takeOverSession = async (
    roomId: string,
    checkType: RoomCheckType,
    userName: string,
    tenantId: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // 1. Xóa session cũ (của bất kỳ ai)
      const { error: deleteError } = await supabase
        .from('room_check_sessions')
        .delete()
        .eq('room_id', roomId)

      if (deleteError) throw deleteError

      // 2. Tạo session mới cho manager
      const { data, error: createError } = await supabase
        .from('room_check_sessions')
        .insert({
          room_id: roomId,
          user_id: user.id,
          user_name: userName,
          check_type: checkType,
          tenant_id: tenantId,
        })
        .select()
        .single()

      if (createError) throw createError

      toast({
        title: 'Đã tiếp quản',
        description: 'Bạn đã tiếp quản phiên kiểm tra phòng này',
      })

      return data
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
      return null
    }
  }

  const updateSessionCheckType = async (sessionId: string, checkType: RoomCheckType) => {
    try {
      const { error } = await supabase
        .from('room_check_sessions')
        .update({ check_type: checkType })
        .eq('id', sessionId)

      if (error) throw error
    } catch (error: any) {
      console.error('Error updating check type:', error)
    }
  }

  return {
    session,
    isLoading,
    createSession,
    deleteSession,
    takeOverSession,
    updateSessionCheckType,
  }
}

export function useAllRoomCheckSessions(tenantId?: string) {
  const [sessions, setSessions] = useState<Record<string, RoomCheckSession>>({})

  useEffect(() => {
    if (!tenantId) return

    const fetchSessions = async () => {
      try {
        const { data, error } = await supabase
          .from('room_check_sessions')
          .select('*')
          .eq('tenant_id', tenantId)

        if (error) throw error
        
        const sessionsMap: Record<string, RoomCheckSession> = {}
        data?.forEach(session => {
          sessionsMap[session.room_id] = {
            id: session.id,
            room_id: session.room_id,
            user_id: session.user_id,
            user_name: session.user_name,
            check_type: session.check_type as RoomCheckType,
            started_at: session.started_at
          }
        })
        setSessions(sessionsMap)
      } catch (error: any) {
        console.error('Error fetching check sessions:', error)
      }
    }

    fetchSessions()

    // Subscribe to all sessions
    const channel = supabase
      .channel(`room-check-sessions-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_check_sessions',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newSession = payload.new as any
            setSessions(prev => ({
              ...prev,
              [newSession.room_id]: {
                id: newSession.id,
                room_id: newSession.room_id,
                user_id: newSession.user_id,
                user_name: newSession.user_name,
                check_type: newSession.check_type as RoomCheckType,
                started_at: newSession.started_at
              }
            }))
          } else if (payload.eventType === 'DELETE') {
            const oldSession = payload.old as any
            setSessions(prev => {
              const newSessions = { ...prev }
              delete newSessions[oldSession.room_id]
              return newSessions
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId])

  return sessions
}
