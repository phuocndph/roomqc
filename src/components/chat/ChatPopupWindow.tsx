import { useNavigate } from 'react-router-dom'
import { Minus, X, Maximize2, ArrowLeft, Phone, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useBreakpoint } from '@/lib/breakpoints'
import { useConversations } from '@/hooks/useChat'
import { ConversationView } from '@/pages/ChatPage'
import { useChatPopups } from './ChatPopupContext'

const POPUP_WIDTH = 320
const POPUP_GAP = 8
const LAUNCHER_OFFSET = 304 // 280 launcher + 24 margin

function initials(name?: string | null) {
  const s = (name || '').trim()
  if (!s) return '?'
  const parts = s.split(/\s+/).slice(-2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

export function ChatPopupWindow({
  conversationId,
  minimized,
  index,
}: {
  conversationId: string
  minimized: boolean
  index: number
}) {
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const { closePopup, toggleMinimize, setLauncherOpen } = useChatPopups()
  const { data: conversations = [] } = useConversations()
  const conv = conversations.find((c) => c.id === conversationId)

  const title = conv
    ? conv.type === 'direct'
      ? conv.peer?.full_name || 'Người dùng'
      : conv.name || 'Nhóm'
    : 'Đang tải...'

  const tgUrl = conv?.peer?.telegram_username
    ? `https://t.me/${conv.peer.telegram_username}`
    : null
  const telUrl = conv?.peer?.phone ? `tel:${conv.peer.phone}` : null

  // ─── MOBILE ───────────────────────────────────────────────────────────────
  if (isMobile) {
    // Only render the top-most (index 0) popup on mobile to avoid stacking sheets.
    if (index > 0) return null
    if (minimized) return null
    return (
      <section
        className="fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-background overscroll-contain"
        aria-label={`Cửa sổ chat với ${title}`}
      >
        <div
          className="flex shrink-0 items-center gap-2 border-b bg-card px-2"
          style={{ paddingTop: 'env(safe-area-inset-top)', minHeight: 'calc(3rem + env(safe-area-inset-top))' }}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0"
            onClick={() => {
              closePopup(conversationId)
              setLauncherOpen(true)
            }}
            aria-label="Quay lại danh sách"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-8 w-8 shrink-0">
            {conv?.peer?.avatar_url && <AvatarImage src={conv.peer.avatar_url} alt={title} />}
            <AvatarFallback className="text-[10px]">
              {conv?.type === 'group' ? 'GR' : initials(title)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 truncate text-sm font-semibold">{title}</div>
          {tgUrl && telUrl ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent hover:text-accent-foreground"
                  aria-label="Gọi"
                  title="Gọi"
                >
                  <Phone className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => window.open(tgUrl, '_blank', 'noopener')}>
                  <Send className="mr-2 h-4 w-4" />
                  Gọi qua Telegram
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { window.location.href = telUrl }}>
                  <Phone className="mr-2 h-4 w-4" />
                  Gọi số điện thoại
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : tgUrl ? (
            <a
              href={tgUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Gọi qua Telegram"
              title="Gọi qua Telegram"
            >
              <Phone className="h-5 w-5" />
            </a>
          ) : telUrl ? (
            <a
              href={telUrl}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Gọi số điện thoại"
              title="Gọi số điện thoại"
            >
              <Phone className="h-5 w-5" />
            </a>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0"
            onClick={() => {
              closePopup(conversationId)
              setLauncherOpen(false)
            }}
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ConversationView conversationId={conversationId} />
        </div>
      </section>
    )
  }


  // ─── DESKTOP ──────────────────────────────────────────────────────────────
  const right = LAUNCHER_OFFSET + index * (POPUP_WIDTH + POPUP_GAP)

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => toggleMinimize(conversationId)}
        className="fixed bottom-0 z-50 flex h-9 w-[200px] items-center gap-2 rounded-t-lg border border-b-0 bg-card px-2 text-left shadow-md hover:bg-muted"
        style={{ right: LAUNCHER_OFFSET + index * (POPUP_WIDTH + POPUP_GAP) }}
        aria-label={`Mở lại chat với ${title}`}
      >
        <Avatar className="h-5 w-5 shrink-0">
          {conv?.peer?.avatar_url && <AvatarImage src={conv.peer.avatar_url} alt={title} />}
          <AvatarFallback className="text-[9px]">
            {conv?.type === 'group' ? 'GR' : initials(title)}
          </AvatarFallback>
        </Avatar>
        <span className="flex-1 truncate text-xs font-medium">{title}</span>
        {conv && conv.unread_count > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
            {conv.unread_count > 9 ? '9+' : conv.unread_count}
          </span>
        )}
      </button>
    )
  }

  return (
    <section
      className="fixed bottom-0 z-50 flex h-[440px] w-[320px] flex-col overflow-hidden rounded-t-lg border border-b-0 bg-background shadow-2xl"
      style={{ right }}
      aria-label={`Cửa sổ chat với ${title}`}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card px-2">
        <Avatar className="h-6 w-6 shrink-0">
          {conv?.peer?.avatar_url && <AvatarImage src={conv.peer.avatar_url} alt={title} />}
          <AvatarFallback className="text-[10px]">
            {conv?.type === 'group' ? 'GR' : initials(title)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 truncate text-sm font-semibold">{title}</div>
        {tgUrl && (
          <a
            href={tgUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="Gọi qua Telegram"
            title="Gọi qua Telegram"
          >
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => navigate(`/chat/${conversationId}`)}
          aria-label="Mở trang chat đầy đủ"
          title="Mở trang chat đầy đủ"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => toggleMinimize(conversationId)}
          aria-label="Thu nhỏ"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => closePopup(conversationId)}
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className={cn('flex-1 min-h-0')}>
        <ConversationView conversationId={conversationId} />
      </div>
    </section>
  )
}
