import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useRoomAuditLog, type RoomAuditEntry } from '@/hooks/useRoomAuditLog'
import { ROOM_STATUS_META_V2 } from '@/lib/roomStatus'
import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import { History, ArrowRight, Clock, User, Bot } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: string
  roomNumber?: string
}

type StatusKey = keyof typeof ROOM_STATUS_META_V2

function statusLabel(s: unknown): string {
  if (typeof s !== 'string' || !s) return '—'
  return (ROOM_STATUS_META_V2 as Record<string, { label: string }>)[s]?.label ?? s
}

function statusClass(s: unknown): string {
  if (typeof s !== 'string') return 'text-muted-foreground'
  return (ROOM_STATUS_META_V2 as Record<string, { text: string }>)[s]?.text ?? 'text-foreground'
}

function actionLabel(action: string): string {
  switch (action) {
    case 'state_change':
      return 'Đổi trạng thái'
    case 'create':
      return 'Tạo'
    case 'update':
      return 'Cập nhật'
    case 'delete':
      return 'Xoá'
    default:
      return action
  }
}

export function RoomAuditLogDialog({ open, onOpenChange, roomId, roomNumber }: Props) {
  const { data, isLoading } = useRoomAuditLog(roomId, 100)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Lịch sử trạng thái {roomNumber ? `· Phòng ${roomNumber}` : ''}
          </DialogTitle>
          <DialogDescription>
            100 thay đổi gần nhất từ hệ thống audit. Cron tick không thay đổi đã được lọc.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Chưa có lịch sử thay đổi.
            </div>
          ) : (
            <ul className="space-y-2">
              {data.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function AuditRow({ entry }: { entry: RoomAuditEntry }) {
  const from = entry.old_data?.status as StatusKey | undefined
  const to = entry.new_data?.status as StatusKey | undefined
  const ctx = entry.context || {}
  const reason = (ctx.reason as string) || (entry.new_data?.dnd_reason as string) || (entry.new_data?.oos_reason as string)
  const isSystem = !entry.actor_id
  const cron = ctx.cron as string | undefined

  let when = ''
  try {
    when = format(parseISO(entry.created_at), 'HH:mm · dd/MM/yyyy', { locale: vi })
  } catch {
    when = entry.created_at
  }

  return (
    <li className="rounded-md border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono uppercase">
              {actionLabel(entry.action)}
            </Badge>
            {from || to ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className={statusClass(from)}>{statusLabel(from)}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className={`font-medium ${statusClass(to)}`}>{statusLabel(to)}</span>
              </div>
            ) : cron ? (
              <span className="text-xs text-muted-foreground">Tự động ({cron})</span>
            ) : null}
          </div>

          {reason && (
            <div className="mt-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Lý do:</span> {reason}
            </div>
          )}

          {(ctx.dnd_until || ctx.oos_until) && (
            <div className="mt-1 text-xs text-amber-600">
              Tự gỡ lúc:{' '}
              {(() => {
                const t = (ctx.dnd_until || ctx.oos_until) as string
                try {
                  return format(parseISO(t), 'HH:mm dd/MM/yyyy', { locale: vi })
                } catch {
                  return t
                }
              })()}
            </div>
          )}
        </div>

        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <div className="flex items-center justify-end gap-1">
            <Clock className="h-3 w-3" />
            {when}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1">
            {isSystem ? (
              <>
                <Bot className="h-3 w-3" /> Hệ thống
              </>
            ) : (
              <>
                <User className="h-3 w-3" />
                <span className="max-w-[140px] truncate">{entry.actor_name || 'Người dùng'}</span>
                {entry.actor_role && (
                  <Badge variant="secondary" className="ml-1 px-1 py-0 text-[9px]">
                    {entry.actor_role}
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
