import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, MoreHorizontal } from 'lucide-react'
import { PermissionGate } from '@/components/auth/PermissionGate'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatCurrency } from '@/lib/utils'
import { useUpdateVendor } from '@/hooks/useLaundryVendors'
import type { LaundryVendor } from '@/types/laundry.types'

interface VendorTableProps {
  vendors: LaundryVendor[]
  onRowClick?: (vendor: LaundryVendor) => void
}

export function VendorTable({ vendors, onRowClick }: VendorTableProps) {
  const navigate = useNavigate()
  const [showStatusDialog, setShowStatusDialog] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState<LaundryVendor | null>(null)
  const updateVendor = useUpdateVendor()
  
  const handleToggleStatus = (vendor: LaundryVendor) => {
    setSelectedVendor(vendor)
    setShowStatusDialog(true)
  }
  
  const confirmStatusToggle = () => {
    if (!selectedVendor) return
    
    const newStatus = selectedVendor.status === 'active' ? 'inactive' : 'active'
    updateVendor.mutate(
      { 
        id: selectedVendor.id, 
        data: { 
          status: newStatus,
          updated_at: new Date().toISOString()
        } as any
      },
      {
        onSuccess: () => {
          setShowStatusDialog(false)
          setSelectedVendor(null)
        }
      }
    )
  }
  
  return (
    <>
      <div className="rounded-md border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Tên đơn vị</TableHead>
                <TableHead className="text-center">Loại</TableHead>
                <TableHead>Liên hệ</TableHead>
                <TableHead className="text-right">Giá/kg</TableHead>
                <TableHead className="text-center">Đánh giá</TableHead>
                <TableHead className="text-center">Đơn hàng</TableHead>
                <TableHead className="text-right">Tổng giá trị</TableHead>
                <TableHead className="text-center">Trạng thái</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((vendor) => {
                const logo = (vendor.contract_info as any)?.logo_url
                const pricePerKg = (vendor.contract_info as any)?.price_per_kg || 0
                
                return (
                  <TableRow
                    key={vendor.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onRowClick?.(vendor)}
                  >
                    <TableCell>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={logo} alt={vendor.name} />
                        <AvatarFallback>{vendor.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{vendor.name}</p>
                        <p className="text-xs text-muted-foreground">{vendor.code}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={vendor.type === 'external' ? 'default' : 'secondary'}>
                        {vendor.type === 'external' ? 'Ngoài' : 'Nội bộ'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{vendor.phone}</p>
                        <p className="text-muted-foreground">{vendor.contact_person}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(pricePerKg)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-medium">
                          {(vendor.rating || 0).toFixed(1)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {vendor.total_orders || 0}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(vendor.total_value || 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={vendor.status === 'active' ? 'default' : 'secondary'}>
                        {vendor.status === 'active' ? 'Hoạt động' : 'Tạm ngưng'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" aria-label="Thêm tùy chọn">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation()
                            onRowClick?.(vendor)
                          }}>
                            Xem chi tiết
                          </DropdownMenuItem>
                          <PermissionGate module="laundry" action="update">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/laundry/vendors/${vendor.id}/edit`)
                            }}>
                              Sửa thông tin
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation()
                              handleToggleStatus(vendor)
                            }}>
                              {vendor.status === 'active' ? 'Vô hiệu hóa' : 'Kích hoạt'}
                            </DropdownMenuItem>
                          </PermissionGate>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận thay đổi trạng thái</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn {selectedVendor?.status === 'active' ? 'vô hiệu hóa' : 'kích hoạt'} đơn vị <strong>{selectedVendor?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusToggle}
              disabled={updateVendor.isPending}
            >
              {updateVendor.isPending ? 'Đang xử lý...' : 'Xác nhận'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
