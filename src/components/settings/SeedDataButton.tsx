import { useState } from 'react'
import { Sprout, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useUser } from '@/hooks/useUser'
import { seedDemoData } from '@/lib/seedDemoData'
import { toast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'
import { runtimeConfig } from '@/lib/runtime-config'

interface SeedProgress {
  step: string
  current: number
  total: number
  message: string
}

export function SeedDataButton() {
  const { tenantId, hotelId, user } = useUser()
  const [isSeeding, setIsSeeding] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [progress, setProgress] = useState<SeedProgress>({
    step: '',
    current: 0,
    total: 15,
    message: ''
  })
  const [showConfirm, setShowConfirm] = useState(false)

  const handleSeedData = async () => {
    if (!tenantId || !hotelId || !user?.id) {
      toast({
        title: 'Lỗi',
        description: 'Không tìm thấy thông tin tenant hoặc hotel',
        variant: 'destructive'
      })
      return
    }

    setShowConfirm(false)
    setIsSeeding(true)
    setShowProgress(true)
    setProgress({
      step: 'starting',
      current: 0,
      total: 15,
      message: '🌱 Bắt đầu tạo dữ liệu demo...'
    })

    try {
      const result = await seedDemoData(
        tenantId,
        hotelId,
        user.id,
        (prog) => {
          setProgress(prog)
        }
      )

      toast({
        title: '✅ Hoàn thành!',
        description: `Đã tạo ${result.summary.items} items, ${result.summary.rooms} rooms, và nhiều dữ liệu khác`,
      })

      // Auto close and refresh after 2 seconds
      setTimeout(() => {
        setShowProgress(false)
        window.location.reload()
      }, 2000)
    } catch (error: unknown) {
      console.error('Seed error:', error)
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error) || 'Không thể tạo dữ liệu demo',
        variant: 'destructive'
      })
      setShowProgress(false)
    } finally {
      setIsSeeding(false)
    }
  }

  const progressPercent = (progress.current / progress.total) * 100

  if (!runtimeConfig.demoDataEnabled) return null

  return (
    <>
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="lg" className="w-full" disabled={isSeeding}>
            <Sprout className="mr-2 h-5 w-5" />
            Tạo dữ liệu Demo
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Xác nhận tạo dữ liệu Demo
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Hành động này sẽ tạo dữ liệu demo bao gồm:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>5 danh mục tài sản</li>
                <li>50 tài sản với số lượng khác nhau</li>
                <li>20 phòng (Standard, Deluxe, Suite)</li>
                <li>Phân bổ tài sản cho từng phòng</li>
                <li>3 nhà cung cấp giặt là</li>
                <li>10 lô giặt với các trạng thái khác nhau</li>
                <li>10 nhà cung cấp hàng hóa</li>
                <li>15 đơn đặt hàng</li>
                <li>100+ giao dịch kho</li>
                <li>5 phiếu kiểm kê</li>
                <li>30 phiếu kiểm tra phòng</li>
                <li>10 yêu cầu bảo trì</li>
                <li>Và nhiều dữ liệu khác...</li>
              </ul>
              <p className="text-warning font-medium">
                ⚠️ Dữ liệu sẽ được thêm vào hệ thống hiện tại. Không thể hoàn tác!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSeedData}
              className="bg-primary"
              disabled={isSeeding}
            >
              Xác nhận tạo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showProgress} onOpenChange={setShowProgress}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sprout className="h-5 w-5 animate-pulse text-success" />
              Đang tạo dữ liệu Demo
            </DialogTitle>
            <DialogDescription>
              Vui lòng đợi, quá trình này có thể mất vài phút...
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{progress.message}</span>
                <span className="text-muted-foreground">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            {progress.current === progress.total && (
              <div className="rounded-lg bg-success/10 p-4 text-center">
                <p className="text-sm font-medium text-success">
                  ✅ Hoàn thành! Đang tải lại trang...
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
