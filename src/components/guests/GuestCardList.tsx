import { useNavigate } from 'react-router-dom'
import type { KeyboardEvent } from 'react'
import { format } from 'date-fns'
import { cn, formatCurrency } from '@/lib/utils'
import type { Guest } from '@/hooks/useGuests'
import { GuestQuickActions } from './GuestQuickActions'

const VIP_LABEL: Record<string, string> = {
  normal: 'Thường', silver: 'Bạc', gold: 'Vàng', vip: 'VIP', platinum: 'Bạch kim', blacklist: 'Blacklist',
}
const VIP_COLOR: Record<string, string> = {
  silver: 'text-slate-600', gold: 'text-amber-700', vip: 'text-slate-700', platinum: 'text-cyan-700', blacklist: 'text-red-700',
}

interface Props {
  guests: Guest[]
  isLoading?: boolean
  canManage: boolean
  onMerge?: (g: Guest) => void
  onEdit?: (g: Guest) => void
}

export function GuestCardList({ guests, isLoading, canManage, onMerge, onEdit }: Props) {
  const navigate = useNavigate()
  const openGuest = (id: string) => navigate(`/guests/${id}`)
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openGuest(id)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
      </div>
    )
  }

  if (guests.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <div className="font-medium text-foreground">Không tìm thấy khách hàng</div>
        <div className="mt-1 text-xs">Thử đổi từ khóa hoặc chọn một nhóm khác.</div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg divide-y">
      {guests.map((g) => (
        <div
          key={g.id}
          role="link"
          tabIndex={0}
          aria-label={`Mở hồ sơ ${g.full_name}`}
          className="flex cursor-pointer items-center gap-3 p-3 outline-none hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => openGuest(g.id)}
          onKeyDown={(event) => handleKeyDown(event, g.id)}
        >
          <div className="h-9 w-9 flex-shrink-0 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
            {g.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{g.full_name}</span>
              {g.vip_level !== 'normal' && (
                <span className={cn('text-xs font-medium', VIP_COLOR[g.vip_level])}>
                  {VIP_LABEL[g.vip_level]}
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {g.phone && <span className="font-mono">{g.phone}</span>}
              {!g.phone && g.email && <span className="truncate">{g.email}</span>}
              {g.last_stay_date && <span>Lần cuối {format(new Date(g.last_stay_date), 'dd/MM')}</span>}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-xs text-muted-foreground">{g.total_stays} lượt</div>
            {g.total_spent > 0 && <div className="text-xs font-mono">{formatCurrency(g.total_spent)}</div>}
          </div>
          <GuestQuickActions guest={g} canManage={canManage} onMerge={onMerge} onEdit={onEdit} />
        </div>
      ))}
    </div>
  )
}
