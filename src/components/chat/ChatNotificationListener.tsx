import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useBreakpoint } from '@/lib/breakpoints'
import { useChatPopups } from './ChatPopupContext'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Users } from 'lucide-react'

type ToastPosition = 'top-center' | 'bottom-right'

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

/**
 * Global listener: hiển thị toast phong cách Messenger khi có tin nhắn mới.
 */
export function ChatNotificationListener() {
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const { popups, openPopup, setLauncherOpen } = useChatPopups()
  const location = useLocation()
  const { isMobile } = useBreakpoint()
  const toastPosition = useMemo<ToastPosition>(() => (isMobile ? 'top-center' : 'bottom-right'), [isMobile])

  const popupsRef = useRef(popups)
  const pathRef = useRef(location.pathname)
  useEffect(() => {
    popupsRef.current = popups
  }, [popups])
  useEffect(() => {
    pathRef.current = location.pathname
  }, [location.pathname])

  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!user?.id || !tenantId) return

    const channel = supabase
      .channel(`chat-notify-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantId}` },
        async (payload: any) => {
          const msg = payload.new
          if (!msg || !msg.id || msg.sender_id === user.id) return
          if (seenRef.current.has(msg.id)) return
          seenRef.current.add(msg.id)

          const openActive = popupsRef.current.find(
            (p) => p.conversationId === msg.conversation_id && !p.minimized
          )
          if (openActive) return
          if (pathRef.current.startsWith('/chat')) return

          const { data: member } = await supabase
            .from('conversation_members')
            .select('user_id, muted_until')
            .eq('conversation_id', msg.conversation_id)
            .eq('user_id', user.id)
            .maybeSingle()
          if (!member) return
          if (member.muted_until && new Date(member.muted_until) > new Date()) return

          const [{ data: sender }, { data: conv }] = await Promise.all([
            supabase.from('users').select('full_name, avatar_url').eq('id', msg.sender_id).maybeSingle(),
            supabase.from('conversations').select('type, name').eq('id', msg.conversation_id).maybeSingle(),
          ])

          const senderName = sender?.full_name || 'Người dùng'
          const avatarUrl = sender?.avatar_url || ''
          const isGroup = conv?.type === 'group'
          const convName = conv?.name || 'Nhóm'

          let preview = (msg.body || '').trim()
          if (!preview) {
            if (msg.has_attachment) {
              const t = (msg.attachment_type || '').toLowerCase()
              preview = t.startsWith('image') ? '📷 Ảnh' : '📎 Tệp đính kèm'
            } else {
              preview = 'Tin nhắn mới'
            }
          }

          const handleOpen = (id: string | number) => {
            setLauncherOpen(true)
            openPopup(msg.conversation_id)
            toast.dismiss(id)
          }

          toast.custom(
            (id) => (
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleOpen(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleOpen(id)
                }}
                className="w-[360px] max-w-[calc(100vw-2rem)] cursor-pointer rounded-xl border border-l-[3px] border-l-primary bg-card p-3 shadow-lg transition hover:bg-accent/40 active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={avatarUrl} alt={senderName} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                        {getInitials(senderName) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    {isGroup && (
                      <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-card bg-primary">
                        <Users className="h-2.5 w-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{senderName}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">vừa xong</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{preview}</p>
                    {isGroup && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                        trong "{convName}"
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ),
            {
              position: toastPosition,
              duration: 6000,
              onAutoClose: () => seenRef.current.delete(msg.id),
              onDismiss: () => seenRef.current.delete(msg.id),
            }
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, tenantId, openPopup, setLauncherOpen, toastPosition])

  return null
}
