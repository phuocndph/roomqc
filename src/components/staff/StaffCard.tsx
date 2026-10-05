import { Phone, MapPin, Clock, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { StaffWithStatus } from '@/hooks/useStaffStatus'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { getTelegramPhoneLink, formatPhoneForTelegram, openTelegramWithFallback, getTelegramDownloadLink } from '@/lib/phone-utils'
import { PRESENCE_DOT_COLOR, PRESENCE_LABEL } from '@/lib/staffPresence'

interface StaffCardProps {
  staff: StaffWithStatus
  onViewDetail?: (staff: StaffWithStatus) => void
}

export function StaffCard({ staff, onViewDetail }: StaffCardProps) {
  const navigate = useNavigate()

  const presence = staff.presence_state
  const isOnShift = presence === 'on_shift_available' || presence === 'on_shift_busy' || presence === 'on_shift_offline'
  const isStale = presence === 'shift_stale'

  
  
  const initials = staff.full_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const lastSeenText = staff.last_seen_at
    ? formatDistanceToNow(new Date(staff.last_seen_at), { addSuffix: true, locale: vi })
    : null

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (staff.phone) {
      window.location.href = `tel:${staff.phone}`
    }
  }

  const handleTelegram = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    let telegramUrl: string | null = null
    
    // Xác định URL để mở
    if (staff.telegram_username) {
      telegramUrl = `tg://resolve?domain=${staff.telegram_username}`
    } else if (staff.phone) {
      telegramUrl = getTelegramPhoneLink(staff.phone)
    } else if (staff.telegram_chat_id) {
      telegramUrl = `tg://user?id=${staff.telegram_chat_id}`
    }
    
    if (!telegramUrl) {
      toast.info(`${staff.full_name} chưa có SĐT - cần cập nhật trong Hồ sơ`)
      navigate(`/settings/users?edit=${staff.id}`)
      return
    }
    
    // Thử mở với fallback
    openTelegramWithFallback(telegramUrl, () => {
      const downloadLink = getTelegramDownloadLink()
      toast.info(
        <div className="flex flex-col gap-2">
          <span>Chưa cài Telegram trên máy</span>
          <a 
            href={downloadLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline font-medium"
          >
            Tải Telegram ngay
          </a>
        </div>,
        { duration: 8000 }
      )
    })
  }

  const hasTelegramConnection = staff.telegram_username || staff.phone || staff.telegram_chat_id

  return (
    <div 
      className="flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={() => onViewDetail?.(staff)}
    >
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarImage src={staff.avatar_url || undefined} alt={staff.full_name} />
        <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        {/* Row 1: Name + Status + Buttons */}
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{staff.full_name}</p>
          <span
            className={cn('h-2 w-2 rounded-full flex-shrink-0', PRESENCE_DOT_COLOR[presence])}
            title={PRESENCE_LABEL[presence]}
          />
          {isOnShift && presence !== 'on_shift_offline' && (
            <Badge variant="outline" className="text-green-600 border-green-600 text-[10px] px-1.5 py-0">
              Đang trong ca
            </Badge>
          )}
          {presence === 'on_shift_offline' && (
            <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-[10px] px-1.5 py-0">
              Trong ca · mất kết nối
            </Badge>
          )}
          {isStale && (
            <Badge variant="outline" className="text-red-600 border-red-600 text-[10px] px-1.5 py-0" title="Ca mở quá 16 giờ — sẽ tự đóng">
              Ca treo
            </Badge>
          )}
          
          {/* Contact buttons inline */}
          <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8",
                hasTelegramConnection 
                  ? "text-blue-500 hover:text-blue-600 hover:bg-blue-50" 
                  : "text-muted-foreground/40 hover:text-muted-foreground/60"
              )}
              onClick={handleTelegram}
              title={
                staff.telegram_username 
                  ? `Telegram @${staff.telegram_username}`
                  : staff.phone 
                    ? `Telegram ${formatPhoneForTelegram(staff.phone)}`
                    : `${staff.full_name} chưa có SĐT - cần cập nhật trong Hồ sơ`
              }
             aria-label="Gửi">
              <Send className="h-4 w-4" />
            </Button>

            {staff.phone && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={handleCall}
                title={`Gọi ${staff.phone}`}
               aria-label="Gọi điện">
                <Phone className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Row 2: Position & Hotel */}
        <p className="text-xs text-muted-foreground truncate">
          {staff.position_name || staff.user_level_code || 'Nhân viên'}
          {staff.hotel_name && <span className="ml-1">• {staff.hotel_name}</span>}
        </p>

        {/* Current activity info */}
        {staff.status === 'busy' && staff.current_activity && (
          <div className="mt-2 flex flex-col gap-1">
            {staff.current_location && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{staff.current_location}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{staff.current_activity}</span>
            </div>
          </div>
        )}

        {/* Last seen for users không sẵn sàng (mất kết nối / ngoài ca / ca treo) */}
        {(presence === 'on_shift_offline' || presence === 'not_on_shift' || presence === 'shift_stale') && lastSeenText && (
          <p className="mt-1 text-xs text-muted-foreground">
            Hoạt động {lastSeenText}
          </p>
        )}
      </div>
    </div>
  )
}
