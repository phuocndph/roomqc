import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { 
  User, 
  Calendar, 
  Phone, 
  Mail, 
  Users,
  Clock,
  Plus,
  Edit2,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useRoomBooking, RoomBooking } from '@/hooks/useRoomBooking'
import { RoomBookingDialog } from './RoomBookingDialog'
import { format, differenceInDays, isToday, isTomorrow } from 'date-fns'
import { vi } from 'date-fns/locale'

interface GuestInfoCardProps {
  roomId: string
  hotelId?: string
  tenantId?: string
  roomNumber?: string
  compact?: boolean
  canEdit?: boolean
}

export function GuestInfoCard({ 
  roomId, 
  hotelId = '',
  tenantId = '',
  roomNumber = '',
  compact = false,
  canEdit = true,
}: GuestInfoCardProps) {
  const { t } = useTranslation(['rooms'])
  const { data: booking, isLoading } = useRoomBooking(roomId)
  const [showBookingDialog, setShowBookingDialog] = useState(false)
  
  if (isLoading) {
    return (
      <div className="border rounded-lg p-4">
        <Skeleton className="h-5 w-32 mb-3" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }
  
  if (!booking) {
    return (
      <>
        <div className="border border-dashed rounded-lg p-4 text-center">
          <User className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground mt-2">
            Chưa có khách
          </p>
          {canEdit && hotelId && tenantId && (
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-3 h-8 text-xs"
              onClick={() => setShowBookingDialog(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Thêm đặt phòng
            </Button>
          )}
        </div>
        
        {canEdit && hotelId && tenantId && (
          <RoomBookingDialog
            open={showBookingDialog}
            onOpenChange={setShowBookingDialog}
            roomId={roomId}
            roomNumber={roomNumber}
            hotelId={hotelId}
            tenantId={tenantId}
          />
        )}
      </>
    )
  }
  
  const checkInDate = new Date(booking.check_in_date)
  const checkOutDate = new Date(booking.check_out_date)
  const stayDuration = differenceInDays(checkOutDate, checkInDate)
  const isCheckingOutToday = isToday(checkOutDate)
  const isCheckingOutTomorrow = isTomorrow(checkOutDate)
  
  const getStatusText = () => {
    switch (booking.status) {
      case 'checked_in':
        return { text: 'Đang ở', color: 'text-green-600' }
      case 'confirmed':
        return { text: 'Đã xác nhận', color: 'text-blue-600' }
      default:
        return null
    }
  }
  
  const status = getStatusText()
  
  if (compact) {
    return (
      <div className="border rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{booking.guest_name}</p>
              <p className="text-[10px] text-muted-foreground">
                {format(checkInDate, 'dd/MM')} - {format(checkOutDate, 'dd/MM')} • {stayDuration} đêm
              </p>
            </div>
          </div>
          {status && (
            <span className={`text-xs font-medium ${status.color}`}>{status.text}</span>
          )}
        </div>
        {isCheckingOutToday && (
          <div className="mt-2 p-2 border border-amber-300 dark:border-amber-700 rounded bg-amber-50/50 dark:bg-amber-950/20">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Checkout hôm nay</span>
            </div>
          </div>
        )}
      </div>
    )
  }
  
  return (
    <>
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Khách hiện tại</p>
          </div>
          <div className="flex items-center gap-2">
            {status && (
              <span className={`text-xs font-medium ${status.color}`}>{status.text}</span>
            )}
            {canEdit && hotelId && tenantId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowBookingDialog(true)}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="space-y-3">
          {/* Guest Name */}
          <div>
            <p className="font-semibold">{booking.guest_name}</p>
            {booking.guest_count > 1 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <Users className="h-3 w-3" />
                <span>{booking.guest_count} khách</span>
              </div>
            )}
          </div>
          
          {/* Contact Info */}
          {(booking.guest_phone || booking.guest_email) && (
            <div className="space-y-1">
              {booking.guest_phone && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <span>{booking.guest_phone}</span>
                </div>
              )}
              {booking.guest_email && (
                <div className="flex items-center gap-2 text-xs">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <span>{booking.guest_email}</span>
                </div>
              )}
            </div>
          )}
          
          {/* Dates */}
          <div className="grid grid-cols-2 gap-3 p-2.5 bg-muted/50 rounded-lg">
            <div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                <Calendar className="h-2.5 w-2.5" />
                <span>Check-in</span>
              </div>
              <p className="text-sm font-medium">{format(checkInDate, 'dd/MM/yyyy', { locale: vi })}</p>
              {booking.actual_check_in && (
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(booking.actual_check_in), 'HH:mm')}
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                <Calendar className="h-2.5 w-2.5" />
                <span>Check-out</span>
              </div>
              <p className={`text-sm font-medium ${isCheckingOutToday ? 'text-amber-600' : ''}`}>
                {format(checkOutDate, 'dd/MM/yyyy', { locale: vi })}
              </p>
              {isCheckingOutToday && (
                <span className="text-[10px] text-amber-600 font-medium">Hôm nay</span>
              )}
              {isCheckingOutTomorrow && (
                <span className="text-[10px] text-muted-foreground">Ngày mai</span>
              )}
            </div>
          </div>
          
          {/* Stay Duration */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{stayDuration} đêm</span>
          </div>
          
          {/* Notes */}
          {booking.notes && (
            <div className="p-2 bg-muted/30 rounded border text-xs">
              <p className="text-[10px] text-muted-foreground mb-0.5">Ghi chú:</p>
              <p>{booking.notes}</p>
            </div>
          )}
        </div>
      </div>
      
      {canEdit && hotelId && tenantId && (
        <RoomBookingDialog
          open={showBookingDialog}
          onOpenChange={setShowBookingDialog}
          roomId={roomId}
          roomNumber={roomNumber}
          hotelId={hotelId}
          tenantId={tenantId}
          booking={booking}
        />
      )}
    </>
  )
}