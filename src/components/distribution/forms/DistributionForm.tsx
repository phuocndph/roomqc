import { Users, Truck, AlertTriangle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RoomMultiSelect } from '@/components/distribution/RoomMultiSelect'
import { ItemAllocator } from './ItemAllocator'
import { useOnShiftStaffList } from '@/hooks/useOnShiftStaffList'
import { useHotelContext } from '@/contexts/HotelContext'
import { useIsMobile } from '@/hooks/use-mobile'
import type { DistributionFormReturn } from '../hooks/useDistributionForm'

interface DistributionFormProps {
  form: DistributionFormReturn
  showHeader?: boolean
}

export function DistributionForm({ form, showHeader = true }: DistributionFormProps) {
  const isMobile = useIsMobile()
  const { selectedHotel } = useHotelContext()
  const { data: staffUsers = [], isLoading: staffLoading } = useOnShiftStaffList(selectedHotel?.id)
  
  const {
    selectedRoomIds,
    setSelectedRoomIds,
    assignedTo,
    setAssignedTo,
    notes,
    setNotes,
    stockValidation,
  } = form

  return (
    <div className={isMobile ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-5 gap-4'}>
      {/* Room Selection - 3/5 = 60% */}
      <Card className={isMobile ? '' : 'lg:col-span-3'}>
        {showHeader && (
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Chọn phòng
            </CardTitle>
            <CardDescription className="text-xs">Chọn các phòng cần giao đồ</CardDescription>
          </CardHeader>
        )}
        <CardContent className={!showHeader ? 'pt-4' : 'pt-0'}>
          <RoomMultiSelect
            selectedRoomIds={selectedRoomIds}
            onSelectionChange={setSelectedRoomIds}
            maxHeight={isMobile ? '200px' : '450px'}
          />
        </CardContent>
      </Card>

      {/* Item Allocation - 2/5 = 40% */}
      <Card className={isMobile ? '' : 'lg:col-span-2'}>
        {showHeader && (
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4" />
              Phân bổ sản phẩm
            </CardTitle>
            <CardDescription className="text-xs">Chọn số lượng sản phẩm cho mỗi phòng</CardDescription>
          </CardHeader>
        )}
        <CardContent className={!showHeader ? 'pt-4' : 'pt-0'}>
          <ItemAllocator form={form} />
          
          {/* Stock validation warning for desktop */}
          {!isMobile && !stockValidation.isValid && (
            <Alert variant="destructive" className="mt-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <span className="font-medium">Vượt quá tồn kho:</span>
                <ul className="mt-1 list-disc list-inside">
                  {stockValidation.overStockItems.map(item => (
                    <li key={item.itemId}>
                      {item.itemName}: yêu cầu {item.requested}, tồn kho {item.available}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Options */}
      <Card className={isMobile ? '' : 'lg:col-span-5'}>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                Người giao hàng
                <span className="text-muted-foreground">(đang trong ca)</span>
              </Label>
              <Select 
                value={assignedTo || 'unassigned'} 
                onValueChange={(val) => setAssignedTo(val === 'unassigned' ? '' : val)}
                disabled={staffLoading}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={staffLoading ? 'Đang tải...' : 'Chọn nhân viên...'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Chưa phân công</SelectItem>
                  {staffUsers.length === 0 ? (
                    <div className="py-2 px-3 text-sm text-muted-foreground">
                      Không có nhân viên đang trong ca
                    </div>
                  ) : (
                    staffUsers.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ghi chú thêm..."
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
