import { useState } from 'react'
import { Plus, Warehouse, MoreHorizontal, Pencil, Trash2, Package } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useWarehouses, useUpdateWarehouse, useDeleteWarehouse } from '@/hooks/useWarehouses'
import { WarehouseForm } from '@/components/warehouse/WarehouseForm'
import { WAREHOUSE_LOCATION_TYPE_LABELS } from '@/types/warehouse.types'
import type { Warehouse as WarehouseType } from '@/types/warehouse.types'

export default function WarehouseListPage() {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseType | null>(null)
  const [deletingWarehouse, setDeletingWarehouse] = useState<WarehouseType | null>(null)

  const { data: warehouses, isLoading } = useWarehouses(true)
  const updateWarehouse = useUpdateWarehouse()
  const deleteWarehouse = useDeleteWarehouse()

  const handleEdit = (warehouse: WarehouseType) => {
    setEditingWarehouse(warehouse)
    setIsFormOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingWarehouse) return
    await deleteWarehouse.mutateAsync(deletingWarehouse.id)
    setDeletingWarehouse(null)
  }

  const handleToggleActive = async (warehouse: WarehouseType) => {
    await updateWarehouse.mutateAsync({
      id: warehouse.id,
      data: { is_active: !warehouse.is_active },
    })
  }

  const handleFormClose = () => {
    setIsFormOpen(false)
    setEditingWarehouse(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Kho"
        description="Thiết lập các vị trí kho lưu trữ trong khách sạn"
      >
        <Button onClick={() => setIsFormOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Thêm kho
        </Button>
      </PageHeader>

      <div className="border rounded-lg">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Mã kho</TableHead>
                <TableHead>Tên kho</TableHead>
                <TableHead className="w-[120px]">Loại</TableHead>
                <TableHead className="w-[100px] text-center">Mặc định</TableHead>
                <TableHead className="w-[100px] text-center">Hoạt động</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : warehouses?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Package className="h-8 w-8 opacity-50" />
                      <p>Chưa có kho nào được tạo</p>
                      <Button variant="outline" size="sm" onClick={() => setIsFormOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Thêm kho đầu tiên
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                warehouses?.map((warehouse) => (
                  <TableRow key={warehouse.id}>
                    <TableCell>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                        {warehouse.code}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Warehouse className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{warehouse.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {WAREHOUSE_LOCATION_TYPE_LABELS[warehouse.location_type]}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {warehouse.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          Mặc định
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={warehouse.is_active}
                        onCheckedChange={() => handleToggleActive(warehouse)}
                        disabled={warehouse.is_default}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Thêm tùy chọn">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(warehouse)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Chỉnh sửa
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletingWarehouse(warehouse)}
                            disabled={warehouse.is_default}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Xóa
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={handleFormClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingWarehouse ? 'Chỉnh sửa kho' : 'Thêm kho mới'}
            </DialogTitle>
          </DialogHeader>
          <WarehouseForm
            warehouse={editingWarehouse}
            onSuccess={handleFormClose}
            onCancel={handleFormClose}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingWarehouse} onOpenChange={() => setDeletingWarehouse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa kho?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xóa kho "{deletingWarehouse?.name}". Hành động này không thể hoàn tác.
              Chỉ có thể xóa kho không còn hàng tồn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
