import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UseFormReturn } from 'react-hook-form'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  Truck, 
  Calendar, 
  User, 
  FileText,
  ChevronRight,
  Building2,
  Star
} from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { TouchButton } from '@/components/mobile/TouchOptimized'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLaundryVendors } from '@/hooks/useLaundryVendors'
import { useUsers } from '@/hooks/useUsers'
import { cn } from '@/lib/utils'
import { triggerHaptic } from '@/lib/haptics'

interface LaundryFormData {
  vendor_id: string
  delivery_date: Date
  expected_return_date: Date
  delivery_staff_id: string
  receiver_name: string
  notes?: string
}

interface MobileLaundryStepsProps {
  form: UseFormReturn<any>
  laundryData: LaundryFormData | null
  onUpdateLaundryData: (data: Partial<LaundryFormData>) => void
}

export function MobileLaundryVendorStep({ 
  form, 
  laundryData, 
  onUpdateLaundryData 
}: MobileLaundryStepsProps) {
  const { t } = useTranslation(['inventory', 'common'])
  const { data: vendors = [], isLoading } = useLaundryVendors({ status: 'active' })
  const [searchQuery, setSearchQuery] = useState('')
  
  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.code?.toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  const selectedVendor = vendors.find(v => v.id === laundryData?.vendor_id)
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold mb-1">{t('inventory:outbound.selectVendor')}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t('inventory:outbound.laundryDescription')}</p>
      </div>
      
      {/* Selected Vendor Display */}
      {selectedVendor && (
        <Card className="p-4 border-primary bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium">{selectedVendor.name}</p>
              <p className="text-sm text-muted-foreground">{selectedVendor.code}</p>
              {selectedVendor.rating && (
                <div className="flex items-center gap-1 mt-1">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  <span className="text-xs">{selectedVendor.rating.toFixed(1)}</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
      
      {/* Search */}
      <Input
        placeholder={t('inventory:outbound.placeholders.selectVendor')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="h-11"
      />
      
      {/* Vendor List */}
      <ScrollArea className="h-[350px]">
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('common:loading')}
            </div>
          ) : filteredVendors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('inventory:mobileForm.noItemsFound')}
            </div>
          ) : (
            filteredVendors.map((vendor) => {
              const isSelected = laundryData?.vendor_id === vendor.id
              return (
                <Card
                  key={vendor.id}
                  className={cn(
                    "p-3 cursor-pointer transition-colors",
                    isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  )}
                  onClick={() => {
                    triggerHaptic('light')
                    onUpdateLaundryData({ vendor_id: vendor.id })
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{vendor.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{vendor.code}</span>
                        {vendor.phone && (
                          <>
                            <span>•</span>
                            <span>{vendor.phone}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {vendor.rating && (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        <span className="text-sm font-medium">{vendor.rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })
          )}
        </div>
      </ScrollArea>
    </motion.div>
  )
}

export function MobileLaundryDeliveryStep({ 
  form, 
  laundryData, 
  onUpdateLaundryData 
}: MobileLaundryStepsProps) {
  const { t } = useTranslation(['inventory', 'common', 'laundry'])
  const { users = [] } = useUsers()
  const [showDeliveryDatePicker, setShowDeliveryDatePicker] = useState(false)
  const [showReturnDatePicker, setShowReturnDatePicker] = useState(false)
  const [showStaffSelector, setShowStaffSelector] = useState(false)
  
  // Filter staff (only staff and managers)
  const availableStaff = users.filter(u => 
    u.user_level_code === 'staff' || u.user_level_code === 'manager'
  )
  
  const selectedStaff = availableStaff.find(s => s.id === laundryData?.delivery_staff_id)
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold mb-1">{t('laundry:batch.deliveryInfo')}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t('laundry:batch.deliveryInfoDesc')}</p>
      </div>
      
      {/* Delivery Date */}
      <div className="space-y-2">
        <Label>{t('laundry:batch.deliveryDate')} *</Label>
        <TouchButton
          variant="outline"
          className="w-full justify-between h-12 font-normal"
          onClick={() => setShowDeliveryDatePicker(true)}
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>
              {laundryData?.delivery_date 
                ? format(laundryData.delivery_date, 'dd/MM/yyyy', { locale: vi })
                : t('common:selectDate')
              }
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </TouchButton>
      </div>
      
      {/* Expected Return Date */}
      <div className="space-y-2">
        <Label>{t('laundry:batch.expectedReturnDate')} *</Label>
        <TouchButton
          variant="outline"
          className="w-full justify-between h-12 font-normal"
          onClick={() => setShowReturnDatePicker(true)}
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>
              {laundryData?.expected_return_date 
                ? format(laundryData.expected_return_date, 'dd/MM/yyyy', { locale: vi })
                : t('common:selectDate')
              }
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </TouchButton>
      </div>
      
      {/* Delivery Staff */}
      <div className="space-y-2">
        <Label>{t('laundry:batch.deliveryStaff')} *</Label>
        <TouchButton
          variant="outline"
          className="w-full justify-between h-12 font-normal"
          onClick={() => setShowStaffSelector(true)}
        >
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>
              {selectedStaff 
                ? selectedStaff.full_name
                : t('laundry:batch.selectStaff')
              }
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </TouchButton>
      </div>
      
      {/* Receiver Name */}
      <div className="space-y-2">
        <Label>{t('laundry:batch.receiverName')} *</Label>
        <Input
          placeholder={t('laundry:batch.receiverNamePlaceholder')}
          value={laundryData?.receiver_name || ''}
          onChange={(e) => onUpdateLaundryData({ receiver_name: e.target.value })}
          className="h-12"
        />
      </div>
      
      {/* Notes */}
      <div className="space-y-2">
        <Label>{t('common:notes')}</Label>
        <Textarea
          placeholder={t('laundry:batch.notesPlaceholder')}
          value={laundryData?.notes || ''}
          onChange={(e) => onUpdateLaundryData({ notes: e.target.value })}
          rows={3}
        />
      </div>
      
      {/* Date Picker Sheets */}
      <Sheet open={showDeliveryDatePicker} onOpenChange={setShowDeliveryDatePicker}>
        <SheetContent side="bottom" className="h-[60vh]">
          <SheetHeader>
            <SheetTitle>{t('laundry:batch.deliveryDate')}</SheetTitle>
          </SheetHeader>
          <div className="flex justify-center mt-4">
            <CalendarComponent
              mode="single"
              selected={laundryData?.delivery_date}
              onSelect={(date) => {
                if (date) {
                  triggerHaptic('light')
                  onUpdateLaundryData({ delivery_date: date })
                  setShowDeliveryDatePicker(false)
                }
              }}
              disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
            />
          </div>
        </SheetContent>
      </Sheet>
      
      <Sheet open={showReturnDatePicker} onOpenChange={setShowReturnDatePicker}>
        <SheetContent side="bottom" className="h-[60vh]">
          <SheetHeader>
            <SheetTitle>{t('laundry:batch.expectedReturnDate')}</SheetTitle>
          </SheetHeader>
          <div className="flex justify-center mt-4">
            <CalendarComponent
              mode="single"
              selected={laundryData?.expected_return_date}
              onSelect={(date) => {
                if (date) {
                  triggerHaptic('light')
                  onUpdateLaundryData({ expected_return_date: date })
                  setShowReturnDatePicker(false)
                }
              }}
              disabled={(date) => {
                const minDate = laundryData?.delivery_date || new Date()
                return date < minDate
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
      
      {/* Staff Selector Sheet */}
      <Sheet open={showStaffSelector} onOpenChange={setShowStaffSelector}>
        <SheetContent side="bottom" className="h-[70vh]">
          <SheetHeader>
            <SheetTitle>{t('laundry:batch.selectStaff')}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[55vh] mt-4">
            <div className="space-y-2">
              {availableStaff.map((staff) => (
                <Card
                  key={staff.id}
                  className={cn(
                    "p-3 cursor-pointer transition-colors",
                    laundryData?.delivery_staff_id === staff.id 
                      ? "border-primary bg-primary/5" 
                      : "hover:bg-muted/50"
                  )}
                  onClick={() => {
                    triggerHaptic('light')
                    onUpdateLaundryData({ delivery_staff_id: staff.id })
                    setShowStaffSelector(false)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{staff.full_name}</p>
                      <p className="text-sm text-muted-foreground">{staff.email}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}

export function validateLaundryData(data: LaundryFormData | null): { isValid: boolean; error?: string } {
  if (!data) return { isValid: false, error: 'Chưa có thông tin giặt là' }
  if (!data.vendor_id) return { isValid: false, error: 'Vui lòng chọn đơn vị giặt' }
  if (!data.delivery_date) return { isValid: false, error: 'Vui lòng chọn ngày giao' }
  if (!data.expected_return_date) return { isValid: false, error: 'Vui lòng chọn ngày nhận dự kiến' }
  if (!data.delivery_staff_id) return { isValid: false, error: 'Vui lòng chọn nhân viên giao' }
  if (!data.receiver_name?.trim()) return { isValid: false, error: 'Vui lòng nhập tên người nhận' }
  return { isValid: true }
}
