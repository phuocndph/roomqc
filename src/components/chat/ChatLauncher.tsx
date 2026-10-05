import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageCircle, X, Minus } from 'lucide-react'

const LAUNCHER_POS_KEY = 'chat-launcher-pos-v1'
const BTN_SIZE = 48

type Pos = { right: number; bottom: number }

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(LAUNCHER_POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p?.right === 'number' && typeof p?.bottom === 'number') return p
  } catch { /* ignore malformed or unavailable local storage */ }
  return null
}
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useBreakpoint } from '@/lib/breakpoints'
import { useUser } from '@/hooks/useUser'
import { useConversations, type ConversationListItem } from '@/hooks/useChat'
import { usePendingCounts } from '@/hooks/usePendingCounts'
import { useOnlinePresence } from '@/hooks/useOnlinePresence'
import { NewConversationDialog } from '@/pages/ChatPage'
import { useChatPopups } from './ChatPopupContext'
import { ChatPopupWindow } from './ChatPopupWindow'

function removeDiacritics(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function initials(name?: string | null) {
  const s = (name || '').trim()
  if (!s) return '?'
  const parts = s.split(/\s+/).slice(-2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

export function ChatLauncher() {
  const location = useLocation()
  if (location.pathname.startsWith('/chat')) return null

  return (
    <>
      <ChatLauncherInner />
      <PopupStack />
    </>
  )
}

function PopupStack() {
  const { popups } = useChatPopups()
  return (
    <>
      {popups.map((p, i) => (
        <ChatPopupWindow
          key={p.conversationId}
          conversationId={p.conversationId}
          minimized={p.minimized}
          index={i}
        />
      ))}
    </>
  )
}

function ChatLauncherInner() {
  const location = useLocation()
  const { user } = useUser()
  const { isMobile } = useBreakpoint()
  const { data: conversations = [], isLoading } = useConversations()
  const { data: pendingCounts } = usePendingCounts()
  const { data: onlineIds } = useOnlinePresence()
  const { openPopup, launcherOpen, setLauncherOpen } = useChatPopups()
  const [search, setSearch] = useState('')

  const unread = pendingCounts?.chatUnread || 0
  const needsActionClearance =
    ['/settings/general', '/settings/notifications', '/settings/ai', '/inventory/inbound', '/inventory/outbound'].includes(location.pathname) ||
    (location.pathname === '/inventory' && location.search.includes('sub=inbound'))

  const visible = useMemo(() => {
    const q = removeDiacritics(search.trim())
    if (!q) return conversations
    return conversations.filter((c) => {
      const title = c.type === 'direct' ? c.peer?.full_name || '' : c.name || ''
      return removeDiacritics(`${title} ${c.last_message_preview || ''}`).includes(q)
    })
  }, [conversations, search])

  // Closed state: draggable floating round button
  if (!launcherOpen) {
    return (
      <DraggableLauncherButton
        unread={unread}
        isMobile={isMobile}
        minBottom={needsActionClearance ? 144 : 0}
        onOpen={() => setLauncherOpen(true)}
      />
    )
  }

  // Open state

  // Open state
  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-foreground/20"
          onClick={() => setLauncherOpen(false)}
          aria-label="Đóng danh sách tin nhắn"
        />
        <aside
          className="fixed inset-x-0 bottom-0 z-50 flex h-[75dvh] flex-col overflow-hidden rounded-t-xl border border-b-0 bg-background shadow-2xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Danh sách tin nhắn"
        >
          <LauncherHeader
            unread={unread}
            onOpenConversation={(id) => openPopup(id)}
            onMinimize={() => setLauncherOpen(false)}
            onClose={() => setLauncherOpen(false)}
            showClose
          />
          <LauncherSearch search={search} setSearch={setSearch} />
          <LauncherList
            isLoading={isLoading}
            visible={visible}
            conversations={conversations}
            onlineIds={onlineIds}
            meId={user?.id || ''}
            onOpen={(id) => openPopup(id)}
          />
        </aside>
      </>
    )
  }

  return (
    <aside
      className="fixed right-5 z-40 flex h-[440px] w-[280px] flex-col overflow-hidden rounded-t-lg border border-b-0 bg-background shadow-2xl"
      style={{ bottom: needsActionClearance ? 72 : 0 }}
      aria-label="Danh sách tin nhắn"
    >
      <LauncherHeader
        unread={unread}
        onOpenConversation={(id) => openPopup(id)}
        onMinimize={() => setLauncherOpen(false)}
      />
      <LauncherSearch search={search} setSearch={setSearch} />
      <LauncherList
        isLoading={isLoading}
        visible={visible}
        conversations={conversations}
        onlineIds={onlineIds}
        meId={user?.id || ''}
        onOpen={(id) => openPopup(id)}
      />
    </aside>
  )
}

function LauncherHeader({
  unread,
  onOpenConversation,
  onMinimize,
  onClose,
  showClose,
}: {
  unread: number
  onOpenConversation: (id: string) => void
  onMinimize: () => void
  onClose?: () => void
  showClose?: boolean
}) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-card px-2">
      <div className="flex min-w-0 items-center gap-2">
        <MessageCircle className="h-4 w-4 text-muted-foreground" />
        <h2 className="truncate text-sm font-semibold">Tin nhắn</h2>
        {unread > 0 && <span className="text-xs font-medium text-primary">{unread}</span>}
      </div>
      <div className="flex items-center gap-1">
        <NewConversationDialog onCreated={onOpenConversation} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onMinimize}
          aria-label="Thu nhỏ"
        >
          <Minus className="h-4 w-4" />
        </Button>
        {showClose && onClose && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function LauncherSearch({ search, setSearch }: { search: string; setSearch: (v: string) => void }) {
  return (
    <div className="border-b p-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm hội thoại..."
        className="h-8 text-xs"
      />
    </div>
  )
}

function LauncherList({
  isLoading,
  visible,
  conversations,
  onlineIds,
  meId,
  onOpen,
}: {
  isLoading: boolean
  visible: ConversationListItem[]
  conversations: ConversationListItem[]
  onlineIds: Set<string> | undefined
  meId: string
  onOpen: (id: string) => void
}) {
  return (
    <ScrollArea className="flex-1">
      {isLoading ? (
        <div className="p-4 text-xs text-muted-foreground">Đang tải...</div>
      ) : visible.length === 0 ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          {conversations.length === 0 ? 'Chưa có hội thoại.' : 'Không có hội thoại khớp.'}
        </div>
      ) : (
        visible.map((c) => (
          <ConversationItem
            key={c.id}
            conv={c}
            meId={meId}
            isOnline={!!(c.peer?.id && onlineIds?.has(c.peer.id))}
            onClick={() => onOpen(c.id)}
          />
        ))
      )}
    </ScrollArea>
  )
}

function ConversationItem({
  conv,
  meId,
  isOnline,
  onClick,
}: {
  conv: ConversationListItem
  meId: string
  isOnline: boolean
  onClick: () => void
}) {
  const title = conv.type === 'direct' ? conv.peer?.full_name || 'Người dùng' : conv.name || 'Nhóm'
  const isGroup = conv.type === 'group'
  const unread = conv.unread_count > 0
  void meId
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 border-b px-2.5 py-2 text-left transition-colors hover:bg-muted/50',
        unread && 'bg-muted/30'
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="h-8 w-8">
          {conv.peer?.avatar_url && <AvatarImage src={conv.peer.avatar_url} alt={title} />}
          <AvatarFallback className="text-[10px]">
            {isGroup ? 'GR' : initials(title)}
          </AvatarFallback>
        </Avatar>
        {!isGroup && (
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background',
              isOnline ? 'bg-green-500' : 'bg-muted-foreground/40'
            )}
            aria-label={isOnline ? 'Đang online' : 'Offline'}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>
          {title}
        </div>
      </div>
      {unread && (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
          {conv.unread_count > 9 ? '9+' : conv.unread_count}
        </span>
      )}
    </button>
  )
}

function DraggableLauncherButton({
  unread,
  isMobile,
  minBottom = 0,
  onOpen,
}: {
  unread: number
  isMobile: boolean
  minBottom?: number
  onOpen: () => void
}) {
  const defaultBottom = Math.max(isMobile ? 72 : 20, minBottom)
  const [pos, setPos] = useState<Pos>(() => loadPos() ?? { right: 16, bottom: defaultBottom })
  const dragRef = useRef<{
    startX: number
    startY: number
    origRight: number
    origBottom: number
    moved: boolean
    pointerId: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)

  // Re-clamp on resize
  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampPos(p))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function clampPos(p: Pos): Pos {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const maxRight = Math.max(4, vw - BTN_SIZE - 4)
    const maxBottom = Math.max(4, vh - BTN_SIZE - 4)
    return {
      right: Math.min(Math.max(4, p.right), maxRight),
      bottom: Math.min(Math.max(4, p.bottom), maxBottom),
    }
  }

  useEffect(() => {
    setPos((p) => clampPos({ ...p, bottom: Math.max(p.bottom, defaultBottom) }))
  }, [defaultBottom])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      ;(e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId)
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origRight: pos.right,
        origBottom: pos.bottom,
        moved: false,
        pointerId: e.pointerId,
      }
    },
    [pos]
  )

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) > 5) {
      d.moved = true
      setDragging(true)
    }
    if (d.moved) {
      const next = clampPos({
        right: d.origRight - dx,
        bottom: d.origBottom - dy,
      })
      setPos(next)
    }
  }, [])

  const finishDrag = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current
      if (!d) return
      const wasMoved = d.moved
      dragRef.current = null
      setDragging(false)
      try {
        ;(e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId)
      } catch { /* pointer capture may already have been released */ }
      if (wasMoved) {
        try {
          localStorage.setItem(LAUNCHER_POS_KEY, JSON.stringify(pos))
        } catch { /* persistence is best effort */ }
      } else {
        onOpen()
      }
    },
    [pos, onOpen]
  )

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        right: pos.right,
        bottom: pos.bottom,
        touchAction: 'none',
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      className={cn(
        'fixed z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-2 ring-primary/30 transition-transform hover:scale-105 active:scale-95',
        dragging && 'scale-110 shadow-2xl'
      )}
      aria-label="Mở danh sách tin nhắn (kéo để di chuyển)"
      title="Kéo để di chuyển"
    >
      <MessageCircle className="h-6 w-6" />
      {unread > 0 && (
        <Badge variant="destructive" className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-[10px]">
          {unread > 9 ? '9+' : unread}
        </Badge>
      )}
    </button>
  )
}
