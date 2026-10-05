import { useState } from 'react'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Skeleton } from '@/components/ui/skeleton'
import { useHotelServices, useDeleteService } from '@/hooks/useHotelServices'
import { ServiceFormDialog } from './ServiceFormDialog'
import { formatCurrency } from '@/lib/utils'
import type { HotelService, ServiceCategory } from '@/types/services.types'
import { SERVICE_CATEGORY_LABELS, SERVICE_CATEGORY_ICONS } from '@/types/services.types'

export function ServiceListTab() {
  const { data: services, isLoading } = useHotelServices()
  const deleteService = useDeleteService()

  const [showForm, setShowForm] = useState(false)
  const [editService, setEditService] = useState<HotelService | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const filtered = (services || []).filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false
    return true
  })

  const handleEdit = (service: HotelService) => {
    setEditService(service)
    setShowForm(true)
  }

  const handleDelete = (id: string) => {
    if (confirm('Xóa dịch vụ này?')) {
      deleteService.mutate(id)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Tìm dịch vụ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="Danh mục" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            {Object.entries(SERVICE_CATEGORY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <PermissionGate module="items" action="create">
          <Button size="sm" className="h-8" onClick={() => { setEditService(null); setShowForm(true) }}>
            <Plus className="h-4 w-4 mr-1" />
            Thêm
          </Button>
        </PermissionGate>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Chưa có dịch vụ nào. Thêm dịch vụ như Massage, Spa, Đặt xe...
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2 font-medium text-xs">Dịch vụ</th>
                <th className="text-left p-2 font-medium text-xs">Danh mục</th>
                <th className="text-right p-2 font-medium text-xs">Đơn giá</th>
                <th className="text-center p-2 font-medium text-xs">Đơn vị</th>
                <th className="text-center p-2 font-medium text-xs">Trạng thái</th>
                <th className="text-right p-2 font-medium text-xs w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span>{s.icon}</span>
                      <div>
                        <div className="font-medium">{s.name}</div>
                        {s.name_en && <div className="text-xs text-muted-foreground">{s.name_en}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {SERVICE_CATEGORY_LABELS[s.category] || s.category}
                  </td>
                  <td className="p-2 text-right font-mono text-xs">{formatCurrency(s.price)}</td>
                  <td className="p-2 text-center text-xs">{s.unit}</td>
                  <td className="p-2 text-center">
                    <span className={s.is_active ? 'text-green-600 text-xs' : 'text-red-600 text-xs'}>
                      {s.is_active ? 'Hoạt động' : 'Tạm dừng'}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex justify-end gap-1">
                      <PermissionGate module="items" action="update">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </PermissionGate>
                      <PermissionGate module="items" action="delete">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => handleDelete(s.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </PermissionGate>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ServiceFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        service={editService}
      />
    </div>
  )
}
