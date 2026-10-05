import { useState, useRef, useEffect, FormEvent, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkConversationRead,
  useCreateDirectConversation,
  useCreateGroupConversation,
  useHotelMembers,
  uploadChatAttachment,
  type ConversationListItem,
  type ChatAttachment,
  type ChatMessage,
  type UploadedChatAttachment,
  type HotelMember,
} from '@/hooks/useChat'
import { useUser } from '@/hooks/useUser'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { navigateBack } from '@/lib/navigation'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { toast } from 'sonner'
import { Paperclip, X, FileText, Loader2, Download, Send, Search, ChevronDown } from 'lucide-react'

/* -------------------- Helpers -------------------- */

function initials(name?: string | null, fallback = '?') {
  const s = (name || '').trim()
  if (!s) return fallback
  const parts = s.split(/\s+/).slice(-2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || fallback
}

function removeDiacritics(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Chủ',
  hotel_manager: 'Quản lý KS',
  department_manager: 'Trưởng bộ phận',
  manager: 'Quản lý',
  staff: 'Nhân viên',
}

const MANAGER_ROLES = new Set(['owner', 'hotel_manager', 'department_manager', 'manager'])

/* -------------------- Conversation row (sidebar) -------------------- */

export function ConversationRow({
  conv,
  active,
  onClick,
  meId,
}: {
  conv: ConversationListItem
  active: boolean
  onClick: () => void
  meId: string
}) {
  const title =
    conv.type === 'direct'
      ? conv.peer?.full_name || 'Người dùng'
      : conv.name || 'Nhóm'
  const preview =
    conv.last_sender_id === meId
      ? `Bạn: ${conv.last_message_preview || ''}`
      : conv.last_message_preview || 'Chưa có tin nhắn'
  const unread = conv.unread_count > 0
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-2.5 py-1.5 border-b hover:bg-muted/50 transition-colors flex items-center gap-2',
        active && 'bg-muted'
      )}
    >
      <Avatar className="h-9 w-9 shrink-0">
        {conv.peer?.avatar_url && <AvatarImage src={conv.peer.avatar_url} alt={title} />}
        <AvatarFallback className="text-[11px]">
          {conv.type === 'group' ? 'GR' : initials(title)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-[13px] truncate', unread ? 'font-semibold' : 'font-medium')}>
            {title}
          </span>
          {conv.last_message_at && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(conv.last_message_at), { locale: vi, addSuffix: false })}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'text-xs truncate',
              unread ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {preview}
          </span>
          {unread && (
            <span className="ml-2 shrink-0 h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
              {conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

/* -------------------- New conversation dialog -------------------- */

function MemberPicker({
  members,
  selected,
  onToggle,
  multi,
}: {
  members: HotelMember[]
  selected: string[]
  onToggle: (id: string, checked: boolean) => void
  multi: boolean
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = removeDiacritics(query.trim())
    if (!q) return members
    return members.filter((m) => {
      const n = removeDiacritics((m.full_name || '') + ' ' + (m.email || ''))
      return n.includes(q)
    })
  }, [members, query])

  const groups = useMemo(() => {
    const managers: HotelMember[] = []
    const staff: HotelMember[] = []
    for (const m of filtered) {
      if (MANAGER_ROLES.has((m.role || '').toLowerCase())) managers.push(m)
      else staff.push(m)
    }
    return [
      { label: 'Quản lý', items: managers },
      { label: 'Nhân viên', items: staff },
    ].filter((g) => g.items.length > 0)
  }, [filtered])

  const selectedMembers = useMemo(
    () => members.filter((m) => selected.includes(m.id)),
    [members, selected]
  )

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm tên hoặc email..."
          className="h-8 pl-8 text-sm"
        />
      </div>

      {multi && selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b pb-2">
          {selectedMembers.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggle(m.id, false)}
              className="inline-flex items-center gap-1 bg-muted hover:bg-muted/70 rounded-full pl-1 pr-1.5 py-0.5 text-[11px]"
            >
              <Avatar className="h-4 w-4">
                {m.avatar_url && <AvatarImage src={m.avatar_url} alt="" />}
                <AvatarFallback className="text-[8px]">{initials(m.full_name)}</AvatarFallback>
              </Avatar>
              <span className="max-w-[100px] truncate">{m.full_name || m.email}</span>
              <X className="h-3 w-3 opacity-60" />
            </button>
          ))}
        </div>
      )}

      <div className="border rounded-md">
        <ScrollArea className="h-72">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Không tìm thấy thành viên
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.label}>
                <div className="sticky top-0 bg-muted/80 backdrop-blur px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
                  {g.label} · {g.items.length}
                </div>
                {g.items.map((m) => {
                  const checked = selected.includes(m.id)
                  return (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 border-b cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => onToggle(m.id, !!c)}
                      />
                      <Avatar className="h-7 w-7 shrink-0">
                        {m.avatar_url && <AvatarImage src={m.avatar_url} alt="" />}
                        <AvatarFallback className="text-[10px]">{initials(m.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] truncate leading-tight">
                          {m.full_name || m.email}
                        </div>
                        {m.full_name && m.email && (
                          <div className="text-[10px] text-muted-foreground truncate leading-tight">
                            {m.email}
                          </div>
                        )}
                      </div>
                      {m.role && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {ROLE_LABEL[m.role] || m.role}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            ))
          )}
        </ScrollArea>
      </div>
    </div>
  )
}

export function NewConversationDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'dm' | 'group'>('dm')
  const [groupName, setGroupName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const { data: members = [], isLoading } = useHotelMembers()
  const createDM = useCreateDirectConversation()
  const createGroup = useCreateGroupConversation()

  const reset = () => {
    setGroupName('')
    setSelected([])
    setTab('dm')
  }

  const handleToggle = (id: string, checked: boolean) => {
    if (!checked) {
      setSelected((s) => s.filter((x) => x !== id))
      return
    }
    if (tab === 'dm') setSelected([id])
    else setSelected((s) => (s.includes(id) ? s : [...s, id]))
  }

  const handleCreate = async () => {
    try {
      if (tab === 'dm') {
        if (selected.length !== 1) {
          toast.error('Chọn đúng 1 người để chat trực tiếp')
          return
        }
        const id = await createDM.mutateAsync(selected[0])
        onCreated(id)
      } else {
        if (!groupName.trim()) {
          toast.error('Nhập tên nhóm')
          return
        }
        if (selected.length < 1) {
          toast.error('Chọn ít nhất 1 thành viên')
          return
        }
        const id = await createGroup.mutateAsync({ name: groupName, memberIds: selected })
        onCreated(id)
      }
      setOpen(false)
      reset()
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Không tạo được hội thoại'))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
          + Mới
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Hội thoại mới</DialogTitle>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as 'dm' | 'group')
            if (v === 'dm' && selected.length > 1) setSelected([selected[0]])
          }}
        >
          <TabsList className="grid grid-cols-2 h-8">
            <TabsTrigger value="dm" className="text-xs">Chat 1-1</TabsTrigger>
            <TabsTrigger value="group" className="text-xs">Tạo nhóm</TabsTrigger>
          </TabsList>
          <TabsContent value="group" className="mt-2">
            <Input
              placeholder="Tên nhóm"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="h-8 text-sm"
            />
          </TabsContent>
          <TabsContent value="dm" className="mt-2" />
        </Tabs>

        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Đang tải...</div>
        ) : (
          <MemberPicker
            members={members}
            selected={selected}
            onToggle={handleToggle}
            multi={tab === 'group'}
          />
        )}

        <Button
          onClick={handleCreate}
          disabled={createDM.isPending || createGroup.isPending}
          className="w-full h-9"
          size="sm"
        >
          {createDM.isPending || createGroup.isPending ? 'Đang tạo...' : 'Tạo hội thoại'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------- Attachments -------------------- */

const MAX_ATTACHMENTS = 6
const MAX_FILE_BYTES = 20 * 1024 * 1024

function formatBytes(n: number | null | undefined) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()
async function getSignedAttachmentUrl(path: string): Promise<string | null> {
  const cached = signedUrlCache.get(path)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.url
  const { data, error } = await supabase.storage
    .from('chat-attachments')
    .createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) return null
  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + 60 * 60 * 1000 })
  return data.signedUrl
}

function AttachmentBubble({ att, mine }: { att: ChatAttachment; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const isImage = (att.mime_type || '').startsWith('image/')
  useEffect(() => {
    let alive = true
    getSignedAttachmentUrl(att.storage_path).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [att.storage_path])

  if (isImage) {
    return (
      <a
        href={url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-xl border max-w-[200px]"
      >
        {url ? (
          <img
            src={url}
            alt={att.file_name || 'image'}
            className="max-h-52 w-auto object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-28 w-36 flex items-center justify-center bg-muted">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </a>
    )
  }
  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      download={att.file_name || undefined}
      className={cn(
        'flex items-center gap-2 rounded-xl border px-2.5 py-1.5 max-w-[220px] hover:bg-muted/60 transition-colors',
        mine ? 'bg-primary-foreground/10 border-primary-foreground/20' : 'bg-background'
      )}
    >
      <FileText className="h-4 w-4 shrink-0 opacity-70" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium truncate">{att.file_name || 'Tệp đính kèm'}</div>
        <div className="text-[10px] opacity-70">{formatBytes(att.size_bytes)}</div>
      </div>
      <Download className="h-3 w-3 opacity-60" />
    </a>
  )
}

interface PendingAttachment {
  id: string
  file: File
  previewUrl?: string
  status: 'uploading' | 'done' | 'error'
  uploaded?: UploadedChatAttachment
  error?: string
}

/* -------------------- Message grouping -------------------- */

interface MessageGroup {
  senderId: string
  sender?: ChatMessage['sender']
  items: ChatMessage[]
}

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  const WINDOW = 3 * 60 * 1000
  for (const m of messages) {
    const last = groups[groups.length - 1]
    const last_t = last && new Date(last.items[last.items.length - 1].created_at).getTime()
    const cur_t = new Date(m.created_at).getTime()
    if (last && last.senderId === m.sender_id && cur_t - last_t < WINDOW) {
      last.items.push(m)
    } else {
      groups.push({ senderId: m.sender_id, sender: m.sender, items: [m] })
    }
  }
  return groups
}

/* -------------------- Conversation view -------------------- */

export function ConversationView({ conversationId }: { conversationId: string }) {
  const { user } = useUser()
  const { data: messages = [], isLoading } = useMessages(conversationId)
  const sendMessage = useSendMessage(conversationId)
  const markRead = useMarkConversationRead()
  const [text, setText] = useState('')
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastMarkedRef = useRef<string | null>(null)
  const lastMsgIdRef = useRef<string | null>(null)

  const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : null

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  // Auto-scroll khi: mở hội thoại lần đầu, hoặc có tin mới (nếu user đang ở gần đáy)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (lastMsgIdRef.current !== lastMsgId) {
      const wasNearBottom =
        lastMsgIdRef.current === null ||
        el.scrollHeight - el.scrollTop - el.clientHeight < 120
      lastMsgIdRef.current = lastMsgId
      if (wasNearBottom) el.scrollTop = el.scrollHeight
    }
  }, [lastMsgId, conversationId])

  // Theo dõi vị trí cuộn để hiện nút "về cuối"
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollBtn(dist > 200)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [conversationId, messages.length])

  // Reset khi đổi hội thoại
  useEffect(() => {
    lastMsgIdRef.current = null
  }, [conversationId])


  // mark read only when last message id changes
  useEffect(() => {
    if (!conversationId || !lastMsgId) return
    const key = `${conversationId}:${lastMsgId}`
    if (lastMarkedRef.current === key) return
    lastMarkedRef.current = key
    markRead.mutate(conversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, lastMsgId])

  useEffect(() => {
    return () => {
      pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const handleFilesPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const remaining = MAX_ATTACHMENTS - pending.length
    const list = Array.from(files).slice(0, remaining)
    if (list.length < files.length) {
      toast.warning(`Tối đa ${MAX_ATTACHMENTS} tệp / tin nhắn`)
    }
    const accepted: PendingAttachment[] = []
    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name}: vượt quá 20MB`)
        continue
      }
      accepted.push({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
        status: 'uploading',
      })
    }
    if (accepted.length === 0) return
    setPending((prev) => [...prev, ...accepted])

    await Promise.all(
      accepted.map(async (p) => {
        try {
          const uploaded = await uploadChatAttachment(conversationId, p.file)
          setPending((prev) =>
            prev.map((x) => (x.id === p.id ? { ...x, status: 'done', uploaded } : x))
          )
        } catch (err: unknown) {
          setPending((prev) =>
            prev.map((x) =>
              x.id === p.id
                ? { ...x, status: 'error', error: errorMessage(err, 'Lỗi upload') }
                : x
            )
          )
          toast.error(`Không tải lên được: ${p.file.name}`)
        }
      })
    )
  }

  const removePending = (id: string) => {
    setPending((prev) => {
      const found = prev.find((p) => p.id === id)
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }

  const isUploading = pending.some((p) => p.status === 'uploading')
  const canSend =
    !isUploading &&
    (text.trim().length > 0 || pending.some((p) => p.status === 'done'))

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSend) return
    const body = text.trim()
    const doneAtt = pending
      .filter((p) => p.status === 'done' && p.uploaded)
      .map((p) => p.uploaded as UploadedChatAttachment)
    const snapshotPending = pending
    // Clear input + pending NGAY để gõ tiếp tin sau không bị chờ
    setText('')
    setPending([])
    // Fire-and-forget — optimistic UI hiện tin tức thì, onError tự rollback
    sendMessage.mutate(
      { body, attachments: doneAtt, clientMsgId: crypto.randomUUID() },
      {
        onSuccess: () => {
          snapshotPending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl))
        },
        onError: (err) => {
          toast.error(errorMessage(err, 'Không gửi được'))
        },
      }
    )
  }

  const groups = useMemo(() => groupMessages(messages), [messages])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overscroll-contain px-3 py-2 space-y-1.5">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Đang tải...</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.
          </div>
        ) : (
          groups.map((g, gi) => {
            const mine = g.senderId === user?.id
            const last = g.items[g.items.length - 1]
            return (
              <div
                key={gi}
                className={cn('flex gap-2', mine ? 'flex-row-reverse' : 'flex-row')}
              >
                {!mine ? (
                  <Avatar className="h-6 w-6 mt-auto shrink-0">
                    {g.sender?.avatar_url && <AvatarImage src={g.sender.avatar_url} alt="" />}
                    <AvatarFallback className="text-[9px]">
                      {initials(g.sender?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-6 shrink-0" />
                )}
                <div
                  className={cn(
                    'flex flex-col gap-0.5 max-w-[72%]',
                    mine ? 'items-end' : 'items-start'
                  )}
                >
                  {!mine && (
                    <span className="text-[10px] text-muted-foreground px-1">
                      {g.sender?.full_name || 'Người dùng'}
                    </span>
                  )}
                  {g.items.map((m, mi) => {
                    const atts = m.attachments || []
                    const isLast = mi === g.items.length - 1
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          'flex flex-col gap-0.5 transition-opacity',
                          mine ? 'items-end' : 'items-start',
                          m._pending && 'opacity-60'
                        )}
                      >
                        {atts.length > 0 && (
                          <div
                            className={cn(
                              'flex flex-col gap-1',
                              mine ? 'items-end' : 'items-start'
                            )}
                          >
                            {atts.map((a) => (
                              <AttachmentBubble key={a.id} att={a} mine={mine} />
                            ))}
                          </div>
                        )}
                        {(m.body || m.deleted_at) && (
                          <div
                            className={cn(
                              'px-2.5 py-1.5 text-[13px] leading-snug break-words whitespace-pre-wrap rounded-2xl',
                              mine
                                ? 'bg-primary text-primary-foreground rounded-br-md'
                                : 'bg-muted rounded-bl-md'
                            )}
                          >
                            {m.deleted_at ? (
                              <span className="italic opacity-70">Tin nhắn đã xoá</span>
                            ) : (
                              m.body
                            )}
                          </div>
                        )}
                        {isLast && (
                          <span className="text-[10px] text-muted-foreground px-1">
                            {new Date(m.created_at).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {m.edited_at && ' · đã sửa'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
        </div>
        {showScrollBtn && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-3 right-3 z-10 h-9 w-9 rounded-full bg-background border shadow-md flex items-center justify-center hover:bg-muted"
            aria-label="Về cuối"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>



      {pending.length > 0 && (
        <div className="border-t px-2 py-1.5 flex gap-1.5 overflow-x-auto bg-muted/30">
          {pending.map((p) => (
            <div
              key={p.id}
              className="relative shrink-0 border rounded-md bg-background overflow-hidden"
              style={{ width: 56, height: 56 }}
            >
              {p.previewUrl ? (
                <img src={p.previewUrl} alt={p.file.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center p-1">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[8px] text-muted-foreground truncate w-full text-center mt-0.5">
                    {p.file.name}
                  </span>
                </div>
              )}
              {p.status === 'uploading' && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </div>
              )}
              {p.status === 'error' && (
                <div className="absolute inset-0 bg-destructive/70 flex items-center justify-center text-[9px] text-destructive-foreground text-center px-1">
                  Lỗi
                </div>
              )}
              <button
                type="button"
                onClick={() => removePending(p.id)}
                className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow"
                aria-label="Xoá"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 z-10 shrink-0 border-t p-1.5 flex gap-1.5 items-center bg-background"
        style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
          onChange={(e) => {
            handleFilesPicked(e.target.files)
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending.length >= MAX_ATTACHMENTS}
          aria-label="Đính kèm tệp"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nhập tin nhắn..."
          className="h-8 text-sm rounded-full px-3"
          autoFocus
        />
        <Button
          type="submit"
          size="sm"
          className="h-8 w-8 p-0 shrink-0 rounded-full"
          disabled={!canSend}
          aria-label="Gửi"
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  )
}

/* -------------------- Page -------------------- */

export default function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  const { user } = useUser()
  const { data: conversations = [], isLoading } = useConversations()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const activeConv = conversations.find((c) => c.id === conversationId) || null

  const activeTitle = activeConv
    ? activeConv.type === 'direct'
      ? activeConv.peer?.full_name || 'Người dùng'
      : activeConv.name || 'Nhóm'
    : null

  const visibleConvs = useMemo(() => {
    const q = removeDiacritics(search.trim())
    return conversations.filter((c) => {
      if (filter === 'unread' && c.unread_count === 0) return false
      if (!q) return true
      const title =
        c.type === 'direct' ? c.peer?.full_name || '' : c.name || ''
      const hay = removeDiacritics(title + ' ' + (c.last_message_preview || ''))
      return hay.includes(q)
    })
  }, [conversations, search, filter])

  return (
    <div className="h-[calc(100dvh-6rem)] md:h-[calc(100dvh-9rem)] md:border md:rounded-lg overflow-hidden flex bg-background">
      {/* Sidebar */}
      <div
        className={cn(
          'w-full md:w-72 border-r flex flex-col min-h-0',
          conversationId && 'hidden md:flex'
        )}
      >
        <div className="p-2 border-b flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Tin nhắn</h2>
          <NewConversationDialog onCreated={(id) => navigate(`/chat/${id}`)} />
        </div>
        <div className="px-2 pt-2 pb-1 space-y-1.5 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm hội thoại..."
              className="h-7 pl-8 text-xs"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'text-[11px] px-2 py-0.5 rounded-full border',
                  filter === f
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                {f === 'all' ? 'Tất cả' : 'Chưa đọc'}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Đang tải...</div>
          ) : visibleConvs.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">
              {conversations.length === 0
                ? 'Chưa có hội thoại. Nhấn "+ Mới" để bắt đầu.'
                : 'Không có hội thoại khớp.'}
            </div>
          ) : (
            visibleConvs.map((c) => (
              <ConversationRow
                key={c.id}
                conv={c}
                active={c.id === conversationId}
                meId={user?.id || ''}
                onClick={() => navigate(`/chat/${c.id}`)}
              />
            ))
          )}
        </ScrollArea>
      </div>

      {/* Conversation pane */}
      <div className={cn('flex-1 flex flex-col min-h-0', !conversationId && 'hidden md:flex')}>
        {conversationId ? (
          <>
            <div className="px-2 py-1.5 border-b flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden h-7 w-7 p-0"
                onClick={() => navigateBack(navigate, '/chat')}
                aria-label="Quay lại"
              >
                ←
              </Button>
              <Avatar className="h-7 w-7">
                {activeConv?.peer?.avatar_url && (
                  <AvatarImage src={activeConv.peer.avatar_url} alt={activeTitle || ''} />
                )}
                <AvatarFallback className="text-[10px]">
                  {activeConv?.type === 'group' ? 'GR' : initials(activeTitle)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-sm font-semibold truncate">{activeTitle}</span>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                  {activeConv?.type === 'group' ? 'Nhóm' : '1-1'}
                </span>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ConversationView conversationId={conversationId} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Chọn một hội thoại để bắt đầu
          </div>
        )}
      </div>
    </div>
  )
}
