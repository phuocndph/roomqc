import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { GroupSibling } from '../RoomQuickViewDialog'

interface Props {
  siblings: GroupSibling[]
  onNavigate?: () => void
}

export function QuickViewGroupSiblings({ siblings, onNavigate }: Props) {
  const navigate = useNavigate()
  if (!siblings.length) return null
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1.5">
      <div className="text-xs text-muted-foreground font-medium">
        Cùng đoàn ({siblings.length + 1} phòng)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {siblings.map((s) => (
          <button
            key={s.roomId}
            type="button"
            onClick={() => {
              navigate(`/rooms/${s.roomId}`)
              onNavigate?.()
            }}
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary transition-colors"
            title={s.guestName ?? ''}
          >
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                s.status?.includes('occupied') ? 'bg-blue-500' :
                  s.status?.includes('clean') ? 'bg-emerald-500' :
                    s.status?.includes('dirty') ? 'bg-amber-500' : 'bg-muted-foreground',
              )}
            />
            {s.roomNumber}
          </button>
        ))}
      </div>
    </div>
  )
}
