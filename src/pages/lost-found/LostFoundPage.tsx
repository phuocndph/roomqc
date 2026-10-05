import { useState } from 'react'
import { Search, PackageSearch, Plus, UserCheck, MoreHorizontal, Trash2, Edit2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { useLostFoundItems, useCreateLostFoundItem, useClaimLostFoundItem, useUpdateLostFoundItem } from '@/hooks/useLostFound'
import { useTenant } from '@/hooks/useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUser } from '@/hooks/useUser'
import { format } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'stored', label: 'Đang lưu giữ' },
  { value: 'claimed', label: 'Đã trả' },
  { value: 'disposed', label: 'Đã xử lý' },
  { value: 'donated', label: 'Đã quyên góp' },
]

const CATEGORY_OPTIONS = [
  { value: 'electronics', label: 'Điện tử' },
  { value: 'clothing', label: 'Quần áo' },
  { value: 'documents', label: 'Giấy tờ' },
  { value: 'jewelry', label: 'Trang sức' },
  { value: 'other', label: 'Khác' },
]

const STATUS_COLORS: Record<string, string> = {
  stored: 'text-amber-600',
  claimed: 'text-green-600',
  disposed: 'text-muted-foreground',
  donated: 'text-blue-600',
}

export default function LostFoundPage() {
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const { user } = useUser()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showClaimDialog, setShowClaimDialog] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<any>(null)

  const { data: items = [], isLoading } = useLostFoundItems({ status: statusFilter, search })
  const createItem = useCreateLostFoundItem()
  const claimItem = useClaimLostFoundItem()
  const updateItem = useUpdateLostFoundItem()

  const [addForm, setAddForm] = useState({
    item_name: '',
    description: '',
    category: 'other',
    found_location: '',
    storage_location: '',
    notes: '',
  })

  const [claimForm, setClaimForm] = useState({ claimed_by_name: '', claimed_by_phone: '' })

  const handleAdd = async () => {
    if (!tenant?.id || !selectedHotel?.id || !addForm.item_name.trim()) return

    // Generate item code
    let itemCode: string | null = null
    try {
      const { data } = await supabase.rpc('generate_lost_found_item_code', { p_tenant_id: tenant.id })
      itemCode = data as string
    } catch (e) { console.warn('Failed to generate item code', e) }

    await createItem.mutateAsync({
      tenant_id: tenant.id,
      hotel_id: selectedHotel.id,
      item_name: addForm.item_name.trim(),
      description: addForm.description || undefined,
      category: addForm.category,
      found_location: addForm.found_location || undefined,
      storage_location: addForm.storage_location || undefined,
      notes: addForm.notes || undefined,
      found_date: new Date().toISOString().split('T')[0],
      found_by: user?.id || null,
    })
    setShowAddDialog(false)
    setAddForm({ item_name: '', description: '', category: 'other', found_location: '', storage_location: '', notes: '' })
  }

  const handleClaim = async () => {
    if (!showClaimDialog || !claimForm.claimed_by_name.trim()) return
    await claimItem.mutateAsync({
      id: showClaimDialog,
      claimed_by_name: claimForm.claimed_by_name.trim(),
      claimed_by_phone: claimForm.claimed_by_phone || undefined,
    })
    setShowClaimDialog(null)
    setClaimForm({ claimed_by_name: '', claimed_by_phone: '' })
  }

  const handleDispose = async (id: string, status: 'disposed' | 'donated') => {
    await updateItem.mutateAsync({ id, status })
  }

  const handleEditSave = async () => {
    if (!editingItem) return
    await updateItem.mutateAsync({
      id: editingItem.id,
      item_name: editingItem.item_name,
      description: editingItem.description,
      category: editingItem.category,
      found_location: editingItem.found_location,
      storage_location: editingItem.storage_location,
      notes: editingItem.notes,
    })
    setEditingItem(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageSearch className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Đồ thất lạc</h1>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
        <Button type="button" size="sm" className="h-8" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Đăng ký
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Tìm kiếm..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <PackageSearch className="h-10 w-10" />
          <p className="text-sm">Chưa có đồ thất lạc nào</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {item.item_code && <span className="font-mono text-[10px] text-muted-foreground">{item.item_code}</span>}
                  <span className="text-sm font-medium">{item.item_name}</span>
                  <span className={`text-xs font-medium ${STATUS_COLORS[item.status] || ''}`}>
                    {STATUS_OPTIONS.find(s => s.value === item.status)?.label}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {CATEGORY_OPTIONS.find(c => c.value === item.category)?.label}
                  {item.found_location && ` • ${item.found_location}`}
                  {item.rooms?.room_number && ` • P.${item.rooms.room_number}`}
                  {' • '}
                  {format(new Date(item.found_date), 'dd/MM/yyyy')}
                </div>
                {item.claimed_by_name && (
                  <div className="text-xs text-green-600 mt-0.5">
                    Đã trả cho: {item.claimed_by_name} {item.claimed_date && `(${format(new Date(item.claimed_date), 'dd/MM/yyyy')})`}
                  </div>
                )}
              </div>
              {item.status === 'stored' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" className="h-7 w-7" aria-label="Thêm tùy chọn">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowClaimDialog(item.id)}>
                      <UserCheck className="h-4 w-4 mr-2" /> Trả đồ
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditingItem({ ...item })}>
                      <Edit2 className="h-4 w-4 mr-2" /> Sửa thông tin
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDispose(item.id, 'disposed')} className="text-red-600">
                      <Trash2 className="h-4 w-4 mr-2" /> Hủy bỏ
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Đăng ký đồ thất lạc</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Tên đồ vật *</Label>
              <Input className="h-8" value={addForm.item_name} onChange={(e) => setAddForm(p => ({ ...p, item_name: e.target.value }))} placeholder="Ví dụ: Điện thoại iPhone 15..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Danh mục</Label>
                <Select value={addForm.category} onValueChange={(v) => setAddForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nơi tìm thấy</Label>
                <Input className="h-8" value={addForm.found_location} onChange={(e) => setAddForm(p => ({ ...p, found_location: e.target.value }))} placeholder="Phòng 101, Sảnh..." />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mô tả</Label>
              <Input className="h-8" value={addForm.description} onChange={(e) => setAddForm(p => ({ ...p, description: e.target.value }))} placeholder="Mô tả chi tiết..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nơi lưu giữ</Label>
              <Input className="h-8" value={addForm.storage_location} onChange={(e) => setAddForm(p => ({ ...p, storage_location: e.target.value }))} placeholder="Tủ lễ tân, Kho..." />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setShowAddDialog(false)}>Hủy</Button>
              <Button type="button" size="sm" className="h-8" onClick={handleAdd} disabled={!addForm.item_name.trim() || createItem.isPending}>Lưu</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Claim Dialog */}
      <Dialog open={!!showClaimDialog} onOpenChange={(open) => !open && setShowClaimDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Trả đồ cho người nhận</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Tên người nhận *</Label>
              <Input className="h-8" value={claimForm.claimed_by_name} onChange={(e) => setClaimForm(p => ({ ...p, claimed_by_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SĐT người nhận</Label>
              <Input className="h-8" value={claimForm.claimed_by_phone} onChange={(e) => setClaimForm(p => ({ ...p, claimed_by_phone: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setShowClaimDialog(null)}>Hủy</Button>
              <Button type="button" size="sm" className="h-8" onClick={handleClaim} disabled={!claimForm.claimed_by_name.trim() || claimItem.isPending}>Xác nhận trả</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Sửa thông tin</DialogTitle></DialogHeader>
          {editingItem && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Tên đồ vật</Label>
                <Input className="h-8" value={editingItem.item_name} onChange={e => setEditingItem((p: any) => ({ ...p, item_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Danh mục</Label>
                  <Select value={editingItem.category} onValueChange={v => setEditingItem((p: any) => ({ ...p, category: v }))}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nơi tìm thấy</Label>
                  <Input className="h-8" value={editingItem.found_location || ''} onChange={e => setEditingItem((p: any) => ({ ...p, found_location: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mô tả</Label>
                <Input className="h-8" value={editingItem.description || ''} onChange={e => setEditingItem((p: any) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nơi lưu giữ</Label>
                <Input className="h-8" value={editingItem.storage_location || ''} onChange={e => setEditingItem((p: any) => ({ ...p, storage_location: e.target.value }))} />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setEditingItem(null)}>Hủy</Button>
                <Button type="button" size="sm" className="h-8" onClick={handleEditSave} disabled={updateItem.isPending}>Lưu</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
