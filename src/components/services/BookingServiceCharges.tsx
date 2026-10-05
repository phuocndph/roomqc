import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBookingServiceCharges, useAddServiceCharge, useDeleteServiceCharge } from '@/hooks/useBookingServiceCharges'
import { useHotelServices } from '@/hooks/useHotelServices'
import { formatCurrency } from '@/lib/utils'

interface BookingServiceChargesProps {
  bookingId: string
  readOnly?: boolean
  onTotalChange?: (total: number) => void
}

export function BookingServiceCharges({ bookingId, readOnly = false, onTotalChange }: BookingServiceChargesProps) {
  const { data: charges = [], isLoading } = useBookingServiceCharges(bookingId)
  const { data: services = [] } = useHotelServices(true)
  const addCharge = useAddServiceCharge()
  const deleteCharge = useDeleteServiceCharge()

  const [showAdd, setShowAdd] = useState(false)
  const [selectedServiceId, setSelectedServiceId] = useState<string>('')
  const [quantity, setQuantity] = useState(1)
  const [customPrice, setCustomPrice] = useState<number | null>(null)

  const selectedService = services.find(s => s.id === selectedServiceId)
  const unitPrice = customPrice ?? selectedService?.price ?? 0

  const totalCharges = charges.reduce((sum, c) => sum + (c.total_price || 0), 0)

  // Notify parent when total changes
  useEffect(() => {
    onTotalChange?.(totalCharges)
  }, [totalCharges, onTotalChange])

  const handleAdd = () => {
    if (!selectedService) return

    addCharge.mutate({
      bookingId,
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      quantity,
      unitPrice,
    }, {
      onSuccess: () => {
        setShowAdd(false)
        setSelectedServiceId('')
        setQuantity(1)
        setCustomPrice(null)
      },
    })
  }

  const handleDelete = (chargeId: string) => {
    deleteCharge.mutate({ chargeId, bookingId })
  }

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">🛎️ Dịch vụ sử dụng</h4>
        {!readOnly && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Thêm
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="space-y-2 p-2 bg-muted/50 rounded-md">
          <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Chọn dịch vụ..." />
            </SelectTrigger>
            <SelectContent>
              {services.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.icon} {s.name} — {formatCurrency(s.price)}/{s.unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedService && (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">SL</label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Đơn giá</label>
                <Input
                  className="h-7 text-xs"
                  type="text"
                  inputMode="numeric"
                  value={customPrice !== null ? customPrice.toString() : selectedService.price.toString()}
                  onChange={(e) => setCustomPrice(parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                />
              </div>
              <div className="text-xs font-medium whitespace-nowrap pb-1">
                = {formatCurrency(quantity * unitPrice)}
              </div>
              <Button type="button" size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={addCharge.isPending}>
                Thêm
              </Button>
            </div>
          )}

          {services.length === 0 && (
            <p className="text-xs text-muted-foreground">Chưa có dịch vụ. Vui lòng thêm trong mục Tài sản → Dịch vụ.</p>
          )}
        </div>
      )}

      {/* List */}
      {charges.length > 0 ? (
        <div className="space-y-1">
          {charges.map(c => (
            <div key={c.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
              <div className="flex-1">
                <span>{c.service_name}</span>
                <span className="text-muted-foreground ml-1">x{c.quantity}</span>
              </div>
              <span className="font-mono">{formatCurrency(c.total_price)}</span>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 ml-1"
                  onClick={() => handleDelete(c.id)}
                  disabled={deleteCharge.isPending}
                >
                  <Trash2 className="h-3 w-3 text-red-600" />
                </Button>
              )}
            </div>
          ))}
          <div className="flex justify-between text-xs font-medium pt-1 border-t">
            <span>Tổng dịch vụ</span>
            <span>{formatCurrency(totalCharges)}</span>
          </div>
        </div>
      ) : (
        !showAdd && <p className="text-xs text-muted-foreground">Chưa có dịch vụ nào</p>
      )}
    </div>
  )
}
