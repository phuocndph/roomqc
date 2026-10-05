import { useNavigate } from 'react-router-dom'
import { MoreHorizontal, Eye, Edit2, Ban, Star, GitMerge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUpdateGuest, type Guest } from '@/hooks/useGuests'

interface Props {
  guest: Guest
  canManage: boolean
  onMerge?: (g: Guest) => void
  onEdit?: (g: Guest) => void
}

export function GuestQuickActions({ guest, canManage, onMerge, onEdit }: Props) {
  const navigate = useNavigate()
  const updateGuest = useUpdateGuest()

  const setVip = (level: string) => {
    updateGuest.mutate({ id: guest.id, vip_level: level })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label={`Tác vụ cho ${guest.full_name}`}
          title="Tác vụ"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => navigate(`/guests/${guest.id}`)}>
          <Eye className="h-3.5 w-3.5 mr-2" /> Xem chi tiết
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuItem onClick={() => onEdit?.(guest)}>
              <Edit2 className="h-3.5 w-3.5 mr-2" /> Sửa nhanh
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setVip('vip')}>
              <Star className="h-3.5 w-3.5 mr-2 text-purple-600" /> Đặt VIP
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setVip('gold')}>
              <Star className="h-3.5 w-3.5 mr-2 text-amber-600" /> Đặt hạng Vàng
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setVip('normal')}>
              Đặt hạng Thường
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setVip('blacklist')} className="text-red-600 focus:text-red-600">
              <Ban className="h-3.5 w-3.5 mr-2" /> Đưa vào Blacklist
            </DropdownMenuItem>
            {onMerge && (
              <DropdownMenuItem onClick={() => onMerge(guest)}>
                <GitMerge className="h-3.5 w-3.5 mr-2" /> Gộp khách trùng
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
