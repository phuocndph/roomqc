import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useHotels } from '@/hooks/useHotels'
import { usePositions } from '@/hooks/usePositions'

export interface UserFilterState {
  search: string
  userLevel: string
  status: string
  hotelId: string
  positionId: string
  department: string
  createdByMe: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: UserFilterState
  onChange: (next: UserFilterState) => void
  onReset: () => void
}

export function MobileUserFiltersSheet({ open, onOpenChange, filters, onChange, onReset }: Props) {
  const { data: hotels } = useHotels()
  const { data: positions } = usePositions()

  const update = (patch: Partial<UserFilterState>) => onChange({ ...filters, ...patch })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl h-[85vh] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-base">Bộ lọc</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <Field label="Cấp bậc">
            <Select value={filters.userLevel} onValueChange={(v) => update({ userLevel: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả cấp bậc</SelectItem>
                <SelectItem value="tenant_owner">Chủ sở hữu</SelectItem>
                <SelectItem value="manager">Quản lý</SelectItem>
                <SelectItem value="staff">Nhân viên</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Trạng thái">
            <Select value={filters.status} onValueChange={(v) => update({ status: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="active">Hoạt động</SelectItem>
                <SelectItem value="inactive">Tạm dừng</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Khách sạn">
            <Select value={filters.hotelId} onValueChange={(v) => update({ hotelId: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả khách sạn</SelectItem>
                {hotels?.map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Chức vụ">
            <Select value={filters.positionId} onValueChange={(v) => update({ positionId: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả chức vụ</SelectItem>
                {positions?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Phòng ban">
            <Select value={filters.department} onValueChange={(v) => update({ department: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả phòng ban</SelectItem>
                <SelectItem value="housekeeping">Buồng phòng</SelectItem>
                <SelectItem value="laundry">Giặt là</SelectItem>
                <SelectItem value="inventory">Kho</SelectItem>
                <SelectItem value="maintenance">Bảo trì</SelectItem>
                <SelectItem value="accounting">Kế toán</SelectItem>
                <SelectItem value="other">Khác</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-center justify-between border rounded-lg p-3">
            <Label htmlFor="created-by-me" className="text-sm">Chỉ người tôi tạo</Label>
            <Switch
              id="created-by-me"
              checked={filters.createdByMe}
              onCheckedChange={(v) => update({ createdByMe: v })}
            />
          </div>
        </div>

        <SheetFooter className="px-4 py-3 border-t flex-row gap-2">
          <Button variant="outline" className="flex-1 h-11" onClick={onReset}>
            Xoá lọc
          </Button>
          <Button className="flex-1 h-11" onClick={() => onOpenChange(false)}>
            Áp dụng
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
