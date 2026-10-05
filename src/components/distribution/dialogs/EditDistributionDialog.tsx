import { useEffect } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { DistributionForm } from '../forms/DistributionForm'
import { useDistributionForm } from '../hooks/useDistributionForm'
import { useUpdateDistributionOrder } from '@/hooks/useDistributionOrders'
import { useIsMobile } from '@/hooks/use-mobile'
import { toast } from 'sonner'
import type { DistributionOrderDetail } from '@/types/distribution.types'

interface EditDistributionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: DistributionOrderDetail | null
}

export function EditDistributionDialog({
  open,
  onOpenChange,
  order,
}: EditDistributionDialogProps) {
  const isMobile = useIsMobile()
  const { mutate: updateOrder, isPending } = useUpdateDistributionOrder()
  
  const form = useDistributionForm({ initialOrder: null })
  const { initFromOrder } = form
  
  // Re-initialize form when dialog opens with order
  useEffect(() => {
    if (open && order) {
      initFromOrder(order)
    }
  }, [open, order, initFromOrder])

  const handleSubmit = () => {
    if (!order) return
    
    if (form.selectedRoomIds.length === 0) {
      toast.error('Vui lòng chọn ít nhất một phòng')
      return
    }

    const roomsWithItems = form.allocations.filter(a => a.items.length > 0)
    if (roomsWithItems.length === 0) {
      toast.error('Vui lòng thêm sản phẩm để giao')
      return
    }

    if (!form.stockValidation.isValid) {
      toast.error('Số lượng yêu cầu vượt quá tồn kho')
      return
    }

    updateOrder({
      orderId: order.id,
      assignedTo: form.assignedTo || undefined,
      notes: form.notes || undefined,
      rooms: roomsWithItems,
    }, {
      onSuccess: () => {
        onOpenChange(false)
        toast.success('Cập nhật phiếu giao hàng thành công')
      },
    })
  }

  const Content = () => (
    <ScrollArea className="max-h-[60vh] px-1">
      <DistributionForm form={form} showHeader={false} />
    </ScrollArea>
  )

  const Footer = () => (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
        Hủy
      </Button>
      <Button onClick={handleSubmit} disabled={isPending || !form.isValid}>
        {isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
      </Button>
    </>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Chỉnh sửa phiếu giao hàng
            </DrawerTitle>
            <DrawerDescription>
              Cập nhật thông tin phiếu {order?.order_code}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">
            <Content />
          </div>
          <DrawerFooter className="flex-row gap-2">
            <Footer />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Chỉnh sửa phiếu giao hàng
          </DialogTitle>
          <DialogDescription>
            Cập nhật thông tin phiếu {order?.order_code}
          </DialogDescription>
        </DialogHeader>
        <Content />
        <DialogFooter>
          <Footer />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
