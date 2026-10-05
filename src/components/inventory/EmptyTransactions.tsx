import { Package, Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

export function EmptyTransactions() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
        <Package className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">
        Chưa có giao dịch nào
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        Bắt đầu bằng cách nhập hoặc xuất kho các đồ dùng của bạn
      </p>
      <div className="flex gap-2">
        <Button onClick={() => navigate('/inventory/inbound')}>
          <Plus className="mr-2 h-4 w-4" />
          Nhập kho
        </Button>
        <Button variant="outline" onClick={() => navigate('/inventory/outbound')}>
          <Minus className="mr-2 h-4 w-4" />
          Xuất kho
        </Button>
      </div>
    </div>
  )
}
