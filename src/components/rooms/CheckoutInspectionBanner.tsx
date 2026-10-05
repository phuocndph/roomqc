import { useState } from 'react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  ClipboardCheck, 
  User, 
  Clock,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import type { CheckoutInspectionRequestWithDetails } from '@/types/checkout-inspection.types'

interface CheckoutInspectionBannerProps {
  inspection: CheckoutInspectionRequestWithDetails
  roomId: string
  onStartInspection: () => Promise<unknown>
  isLoading?: boolean
}

export function CheckoutInspectionBanner({
  inspection,
  roomId,
  onStartInspection,
  isLoading,
}: CheckoutInspectionBannerProps) {
  const navigate = useNavigate()
  const [isStarting, setIsStarting] = useState(false)
  
  const handleStartAndNavigate = async () => {
    // Nếu pending, đợi mutation hoàn thành trước khi navigate
    if (inspection.status === 'pending') {
      setIsStarting(true)
      try {
        await onStartInspection()
      } catch (error) {
        console.error('Error starting inspection:', error)
        setIsStarting(false)
        return // Không navigate nếu lỗi
      }
    }
    // Navigate sau khi mutation thành công
    navigate(`/rooms/${roomId}/check?type=checkout&inspection=${inspection.id}`)
  }
  
  const booking = inspection.booking as { id: string; guest_name: string; check_out_date: string } | undefined
  
  const buttonLoading = isLoading || isStarting
  
  return (
    <div className="mx-4 mb-4 p-4 rounded-lg border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/30">
      <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 mb-3">
        <ClipboardCheck className="h-5 w-5" />
        <span className="font-semibold">Khách vừa trả phòng — cần kiểm tra</span>
      </div>
      
      <div className="space-y-2 mb-4">
        {booking?.guest_name && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>Khách: <strong>{booking.guest_name}</strong></span>
          </div>
        )}
        
        {inspection.requested_user && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>Lễ tân báo: <strong>{inspection.requested_user.full_name}</strong></span>
          </div>
        )}
        
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>
            {inspection.status === 'pending' ? 'Báo lúc: ' : 'Bắt đầu lúc: '}
            <strong>
              {format(
                new Date(inspection.status === 'in_progress' ? inspection.started_at! : inspection.created_at),
                'HH:mm dd/MM/yyyy',
                { locale: vi }
              )}
            </strong>
          </span>
        </div>
      </div>
      
      <Button
        onClick={handleStartAndNavigate}
        disabled={buttonLoading}
        className="w-full h-11 gap-2 bg-orange-600 hover:bg-orange-700 text-white"
      >
        {buttonLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ClipboardCheck className="h-5 w-5" />
        )}
        {inspection.status === 'pending' ? 'Bắt đầu kiểm tra' : 'Tiếp tục kiểm tra'}
        <ArrowRight className="h-4 w-4 ml-auto" />
      </Button>
    </div>
  )
}
