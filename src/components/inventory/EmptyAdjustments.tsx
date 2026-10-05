import { ClipboardList, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

export function EmptyAdjustments() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
        <ClipboardList className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">
        Chưa có phiếu kiểm kê nào
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        Tạo phiếu kiểm kê mới để theo dõi và đối chiếu tồn kho
      </p>
      <Button onClick={() => navigate('/inventory/adjustments/new')}>
        <Plus className="mr-2 h-4 w-4" />
        Tạo phiếu kiểm kê
      </Button>
    </div>
  )
}
