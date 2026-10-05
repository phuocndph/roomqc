import { useNavigate } from 'react-router-dom'
import type { KeyboardEvent, ReactNode } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import type { Guest } from '@/hooks/useGuests'
import type { GuestSortKey } from '@/hooks/useGuestsV2'
import { GuestQuickActions } from './GuestQuickActions'

const VIP_LABEL: Record<string, string> = {
  normal: 'Thường', silver: 'Bạc', gold: 'Vàng', vip: 'VIP', platinum: 'Bạch kim', blacklist: 'Blacklist',
}
interface Props {
  guests: Guest[]
  isLoading?: boolean
  sortBy: GuestSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: GuestSortKey) => void
  canManage: boolean
  onMerge?: (g: Guest) => void
  onEdit?: (g: Guest) => void
}

interface SortHeaderProps {
  active: boolean
  dir: 'asc' | 'desc'
  label: string
  children: ReactNode
  onClick: () => void
  className?: string
}

function SortHeader({ active, dir, label, children, onClick, className }: SortHeaderProps) {
  return (
    <button
      aria-label={`Sắp xếp theo ${label}${active ? (dir === 'asc' ? ', tăng dần' : ', giảm dần') : ''}`}
      type="button"
      onClick={onClick}
      className={cn('inline-flex items-center gap-1 hover:text-foreground transition-colors', className)}
    >
      {children}
      {active ? (
        dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  )
}

export function GuestDataTable({ guests, isLoading, sortBy, sortDir, onSort, canManage, onMerge, onEdit }: Props) {
  const navigate = useNavigate()

  const openGuest = (id: string) => navigate(`/guests/${id}`)
  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openGuest(id)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">
                <SortHeader label="họ tên" active={sortBy === 'full_name'} dir={sortDir} onClick={() => onSort('full_name')}>Họ tên</SortHeader>
              </th>
              <th className="px-3 py-2 text-left font-medium">Liên hệ</th>
              <th className="px-3 py-2 text-left font-medium">Hạng</th>
              <th className="px-3 py-2 text-right font-medium">
                <SortHeader label="lượt ở" active={sortBy === 'total_stays'} dir={sortDir} onClick={() => onSort('total_stays')}>Lượt ở</SortHeader>
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <SortHeader label="chi tiêu" active={sortBy === 'total_spent'} dir={sortDir} onClick={() => onSort('total_spent')}>Chi tiêu</SortHeader>
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <SortHeader label="lần ở gần nhất" active={sortBy === 'last_stay_date'} dir={sortDir} onClick={() => onSort('last_stay_date')}>Lần ở gần nhất</SortHeader>
              </th>
              <th className="sticky right-0 z-20 w-12 bg-card shadow-[-4px_0_8px_rgba(0,0,0,0.08)]"></th>
            </tr>
          </thead>
          <tbody>
            {guests.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                  <div className="font-medium text-foreground">Không tìm thấy khách hàng</div>
                  <div className="mt-1 text-xs">Thử đổi từ khóa hoặc chọn một nhóm khác.</div>
                </td>
              </tr>
            ) : guests.map((g) => (
              <tr
                key={g.id}
                tabIndex={0}
                className="cursor-pointer border-b outline-none last:border-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => openGuest(g.id)}
                onKeyDown={(event) => handleRowKeyDown(event, g.id)}
              >
                <td className="px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                      {g.full_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{g.full_name}</div>
                      {g.id_number && <div className="truncate font-mono text-xs text-muted-foreground">{g.id_type?.toUpperCase()}: {g.id_number}</div>}
                    </div>
                  </div>
                </td>
                <td className="max-w-[240px] px-3 py-2.5">
                  <div className="truncate font-mono text-xs">{g.phone || '—'}</div>
                  {g.email && <div className="truncate text-xs text-muted-foreground" title={g.email}>{g.email}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn(
                    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                    g.vip_level === 'blacklist' ? 'border border-red-600 bg-background text-red-700' :
                    g.vip_level === 'vip' ? 'border border-slate-600 bg-background text-slate-700' :
                    g.vip_level === 'platinum' ? 'border border-cyan-600 bg-background text-cyan-700' :
                    g.vip_level === 'gold' ? 'border border-amber-600 bg-background text-amber-700' :
                    g.vip_level === 'silver' ? 'border border-slate-500 bg-background text-slate-700' :
                    'bg-muted text-muted-foreground',
                  )}>
                    {VIP_LABEL[g.vip_level] || g.vip_level}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{g.total_stays}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                  {g.total_spent > 0 ? formatCurrency(g.total_spent) : '—'}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {g.last_stay_date ? format(new Date(g.last_stay_date), 'dd/MM/yyyy') : '—'}
                </td>
                <td className="sticky right-0 z-10 bg-card px-1 py-2.5 text-right shadow-[-4px_0_8px_rgba(0,0,0,0.08)]">
                  <GuestQuickActions guest={g} canManage={canManage} onMerge={onMerge} onEdit={onEdit} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
