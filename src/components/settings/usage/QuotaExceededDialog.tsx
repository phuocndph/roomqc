import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface QuotaExceededDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resourceType: string
  currentUsage: number
  limit: number
}

export function QuotaExceededDialog({
  open,
  onOpenChange,
  resourceType,
  currentUsage,
  limit,
}: QuotaExceededDialogProps) {
  const navigate = useNavigate()

  const resourceNames: Record<string, string> = {
    hotel: 'khách sạn',
    user: 'người dùng',
    room: 'phòng',
    item: 'tài sản',
    storage: 'lưu trữ',
  }

  const resourceName = resourceNames[resourceType] || resourceType

  const handleUpgrade = () => {
    onOpenChange(false)
    navigate('/settings/subscription')
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <AlertDialogTitle>Đã đạt giới hạn {resourceName}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3 pt-2">
            <p>
              Bạn đã sử dụng <span className="font-semibold">{currentUsage}/{limit}</span> {resourceName} 
              trong gói hiện tại.
            </p>
            <p>
              Để tiếp tục thêm {resourceName} mới, vui lòng nâng cấp gói dịch vụ hoặc xóa bớt {resourceName} không sử dụng.
            </p>
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium mb-1">Khuyến nghị:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Nâng cấp gói để có thêm {resourceName}</li>
                <li>Xem lại và xóa {resourceName} không còn sử dụng</li>
                <li>Liên hệ hỗ trợ để được tư vấn gói phù hợp</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction onClick={handleUpgrade} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Nâng cấp ngay
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
