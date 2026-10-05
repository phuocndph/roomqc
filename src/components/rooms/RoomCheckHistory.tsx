import { CheckCircle, AlertTriangle, Star } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import type { RoomCheckWithUser } from '@/types/rooms.types'

interface RoomCheckHistoryProps {
  checks: RoomCheckWithUser[]
}

export function RoomCheckHistory({ checks }: RoomCheckHistoryProps) {
  if (checks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Chưa có lịch sử kiểm tra
      </p>
    )
  }
  
  return (
    <div className="space-y-4">
      {checks.map((check) => (
        <div key={check.id} className="flex gap-3 pb-4 border-b last:border-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={check.checked_by_avatar || undefined} />
            <AvatarFallback>
              {check.checked_by_name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{check.checked_by_name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(check.checked_at), { addSuffix: true, locale: vi })}
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                {check.check_type === 'daily' && 'Hàng ngày'}
                {check.check_type === 'checkin' && 'Check-in'}
                {check.check_type === 'checkout' && 'Check-out'}
                {check.check_type === 'maintenance' && 'Bảo trì'}
              </Badge>
            </div>
            
            {check.cleanliness_score && (
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3 w-3 ${
                      i < check.cleanliness_score!
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-muted'
                    }`}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-1">
                  {check.cleanliness_score}/5
                </span>
              </div>
            )}
            
            {check.items_complete ? (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="h-3 w-3" />
                <span>Đồ dùng đầy đủ</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3" />
                <span>
                  Thiếu {(check.items_missing as any[])?.length || 0} items
                </span>
              </div>
            )}
            
            {check.notes && (
              <p className="text-xs text-muted-foreground">
                {check.notes}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
