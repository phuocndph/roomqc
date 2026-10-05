import { useNavigate } from 'react-router-dom'
import { Calendar, LogIn, LogOut } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CheckType } from '@/types/rooms.types'

interface CheckTypeSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: string
  roomNumber: string
}

export function CheckTypeSelector({
  open,
  onOpenChange,
  roomId,
  roomNumber,
}: CheckTypeSelectorProps) {
  const navigate = useNavigate()

  const startCheck = (type: CheckType) => {
    navigate(`/rooms/${roomId}/check?type=${type}`)
    onOpenChange(false)
  }

  const checkTypes = [
    {
      type: 'daily' as CheckType,
      icon: Calendar,
      title: 'Kiểm tra đầu ngày',
      description: 'Kiểm tra vệ sinh và đồ dùng thường ngày',
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-950',
    },
    {
      type: 'checkin' as CheckType,
      icon: LogIn,
      title: 'Trước khi khách check-in',
      description: 'Kiểm tra phòng sẵn sàng cho khách mới',
      color: 'text-green-500',
      bgColor: 'bg-green-50 hover:bg-green-100 dark:bg-green-950/50 dark:hover:bg-green-950',
    },
    {
      type: 'checkout' as CheckType,
      icon: LogOut,
      title: 'Sau khi khách check-out',
      description: 'Kiểm tra phòng sau khi khách rời đi',
      color: 'text-orange-500',
      bgColor: 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/50 dark:hover:bg-orange-950',
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Chọn loại kiểm tra - Phòng {roomNumber}</DialogTitle>
          <DialogDescription>
            Chọn loại kiểm tra phù hợp với tình huống hiện tại
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          {checkTypes.map(({ type, icon: Icon, title, description, color, bgColor }) => (
            <Card
              key={type}
              className={`cursor-pointer transition-all ${bgColor} border-2 hover:border-primary`}
              onClick={() => startCheck(type)}
            >
              <CardHeader className="p-4">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${color} bg-background`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base mb-1">{title}</CardTitle>
                    <CardDescription className="text-sm">
                      {description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
