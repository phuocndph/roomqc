import { UseFormReturn } from 'react-hook-form'
import { X, Star, CheckCircle2, XCircle, Loader2, Shirt, Droplets, Tv, Send, RefreshCw, Package, Wrench, Minus, AlertTriangle, User, Calendar, ChevronDown, ChevronUp, Camera, ClipboardCheck, LogIn, LogOut, Settings, PackagePlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useUser } from '@/hooks/useUser'
import { formatCurrency } from '@/lib/utils'
import { getCheckTypeConfig, type CheckType } from '@/lib/roomCheckConfig'
import type { RoomCheckFormData, LaundryItem, ConsumedItem, LostItem, ReplacedItem } from '@/types/rooms.types'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

interface ReviewStepProps {
  form: UseFormReturn<RoomCheckFormData>
  room: any
  checkType: CheckType
  currentBooking?: any
}

// Icon mapping for check types
const CHECK_TYPE_ICONS: Record<CheckType, any> = {
  daily: ClipboardCheck,
  checkin: LogIn,
  checkout: LogOut,
  maintenance: Settings,
  delivery: Package,
  replenish: PackagePlus,
}

export function ReviewStep({ form, room, checkType, currentBooking }: ReviewStepProps) {
  const { tenantId } = useUser()
  const { uploadImages, isUploading } = useImageUpload()
  const [photos, setPhotos] = useState<string[]>([])
  const [showDetails, setShowDetails] = useState(false)
  
  const config = getCheckTypeConfig(checkType)
  const CheckTypeIcon = CHECK_TYPE_ICONS[checkType]
  const cleanlinessScore = form.watch('cleanliness_score')
  const itemsComplete = form.watch('items_complete')
  const itemsMissing = form.watch('items_missing') || []
  const itemsDamaged = form.watch('items_damaged') || []
  
  // New detailed tracking
  const itemsSentToLaundry = form.watch('items_sent_to_laundry') || []
  const itemsConsumed = form.watch('items_consumed') || []
  const itemsLost = form.watch('items_lost') || []
  const itemsReplaced = form.watch('items_replaced') || []
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0 || !tenantId) return
    
    if (photos.length + files.length > 10) {
      toast.error('Tối đa 10 ảnh')
      return
    }
    
    try {
      const uploaded = await uploadImages(files, tenantId)
      const urls = uploaded.map(img => img.url)
      const newPhotos = [...photos, ...urls]
      
      setPhotos(newPhotos)
      form.setValue('photos', newPhotos)
      toast.success(`Đã tải lên ${uploaded.length} ảnh`)
    } catch (error) {
      toast.error('Lỗi tải ảnh lên. Vui lòng thử lại.')
      console.error('Upload error:', error)
    }
  }
  
  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index)
    setPhotos(newPhotos)
    form.setValue('photos', newPhotos)
  }

  // Calculate totals
  const totalLaundry = itemsSentToLaundry.reduce((sum, i) => sum + i.quantity, 0)
  const totalConsumed = itemsConsumed.reduce((sum, i) => sum + i.quantity, 0)
  const totalLost = itemsLost.reduce((sum, i) => sum + i.quantity, 0)
  const totalReplaced = itemsReplaced.reduce((sum, i) => sum + i.quantity, 0)
  const totalDamaged = itemsDamaged.length
  const totalMissing = itemsMissing.reduce((sum, i) => sum + (i.shortage || 0), 0)
  const hasActions = totalLaundry > 0 || totalConsumed > 0 || totalLost > 0 || totalReplaced > 0 || totalDamaged > 0 || totalMissing > 0
  
  // Check if room is ready (for check-in)
  const isRoomReady = !hasActions && itemsComplete
  
  // Summary stats for collapsed view
  const summaryItems = [
    totalLaundry > 0 && `${totalLaundry} giặt`,
    totalConsumed > 0 && `${totalConsumed} dùng`,
    totalMissing > 0 && `${totalMissing} thiếu`,
    totalLost > 0 && `${totalLost} mất`,
    totalDamaged > 0 && `${totalDamaged} hỏng`,
  ].filter(Boolean)
  
  return (
    <div className="space-y-4">
      
      {/* Check-in Readiness Alert */}
      {checkType === 'checkin' && (
        <Alert 
          variant={isRoomReady ? 'default' : 'destructive'} 
          className={cn('py-2', isRoomReady && 'border-green-500 bg-green-50')}
        >
          {isRoomReady ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <AlertTitle className={cn('text-sm', isRoomReady && 'text-green-700')}>
            {isRoomReady ? 'Phòng sẵn sàng đón khách' : 'Phòng chưa sẵn sàng'}
          </AlertTitle>
          {!isRoomReady && config.blockOnDamaged && (
            <AlertDescription className="text-xs">
              Cần xử lý các vấn đề trước khi cho khách nhận phòng
            </AlertDescription>
          )}
        </Alert>
      )}
      
      {/* Booking Info Card - For checkin/checkout */}
      {config.showBookingInfo && currentBooking && (
        <div className={cn(
          'p-3 rounded-lg border',
          checkType === 'checkout' ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50'
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <User className={cn('h-4 w-4 flex-shrink-0', checkType === 'checkout' ? 'text-orange-600' : 'text-green-600')} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{currentBooking.guest_name || 'Khách'}</p>
                {currentBooking.guest_phone && (
                  <p className="text-xs text-muted-foreground">{currentBooking.guest_phone}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
              <Calendar className="h-3 w-3" />
              <span>
                {currentBooking.check_in_date && format(new Date(currentBooking.check_in_date), 'dd/MM', { locale: vi })}
                {' - '}
                {currentBooking.check_out_date && format(new Date(currentBooking.check_out_date), 'dd/MM', { locale: vi })}
              </span>
            </div>
          </div>
          
          {/* Checkout summary: số đồ cần xử lý (không hiển thị chi phí — quản lý xử lý sau) */}
          {checkType === 'checkout' && (totalLost > 0 || totalDamaged > 0) && (
            <div className="mt-2 pt-2 border-t border-orange-200 flex items-center justify-between">
              <span className="text-xs text-orange-700">Cần xử lý:</span>
              <span className="font-medium text-orange-700 text-xs">
                {totalLost > 0 && `${totalLost} mất`}
                {totalLost > 0 && totalDamaged > 0 && ' • '}
                {totalDamaged > 0 && `${totalDamaged} hỏng (cần thay)`}
              </span>
            </div>
          )}
        </div>
      )}
      
      {/* Daily — Hygiene summary block: hiển thị tình trạng vệ sinh đã chọn ở step 2 */}
      {checkType === 'daily' && (() => {
        const cond = form.watch('room_condition') as 'clean' | 'dirty' | 'very_dirty' | undefined
        if (!cond) return null
        const condLabel = cond === 'clean' ? 'Sạch' : cond === 'dirty' ? 'Bẩn nhẹ' : 'Rất bẩn'
        const condColor = cond === 'clean' ? 'text-green-600' : cond === 'dirty' ? 'text-amber-600' : 'text-red-600'
        const willCreateCleaning = cond !== 'clean'
        const willCreateMaintenance = itemsDamaged.length > 0
        return (
          <div className="rounded-lg border p-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tình trạng vệ sinh phòng:</span>
              <strong className={condColor}>{condLabel}</strong>
            </div>
            {willCreateCleaning && (
              <div className="text-xs text-amber-600">
                → Sẽ tự tạo phiếu lau dọn cho bộ phận buồng phòng
              </div>
            )}
            {willCreateMaintenance && (
              <div className="text-xs text-red-600">
                → Sẽ tự tạo phiếu báo hỏng cho bộ phận bảo trì ({itemsDamaged.length} món)
              </div>
            )}
            {!willCreateCleaning && !willCreateMaintenance && (
              <div className="text-xs text-green-600">
                → Chỉ ghi nhận lượt kiểm tra, không tạo phiếu nào
              </div>
            )}
          </div>
        )
      })()}

      {/* Cleanliness Score - Auto-filled from room condition, still editable */}
      <FormField
        control={form.control}
        name="cleanliness_score"
        render={({ field }) => {
          const roomCondition = form.watch('room_condition')
          // Auto-fill if not yet set manually
          if (roomCondition && !field.value) {
            const autoScore = roomCondition === 'clean' ? 4 : roomCondition === 'dirty' ? 2 : 1
            field.onChange(autoScore)
          }
          return (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel className="text-sm">Đánh giá độ sạch</FormLabel>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => field.onChange(score)}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className={cn(
                          'h-7 w-7',
                          score <= (cleanlinessScore || 0)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-muted-foreground'
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )
        }}
      />
      
      {/* Summary - Collapsible */}
      <Collapsible open={showDetails} onOpenChange={setShowDetails}>
        <div className="border rounded-lg">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Tóm tắt</span>
                {hasActions ? (
                  <div className="flex flex-wrap gap-1">
                    {summaryItems.map((item, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {item}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Tất cả OK
                  </Badge>
                )}
              </div>
              {showDetails ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="px-3 pb-3 pt-1 space-y-3 border-t">
              {/* Basic Info */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="outline">{config.label}</Badge>
                <Badge variant={itemsComplete ? 'default' : 'destructive'}>
                  {itemsComplete ? 'Đầy đủ' : 'Có vấn đề'}
                </Badge>
              </div>
              
              {hasActions && (
                <>
                  {/* Linen Section */}
                  {(itemsSentToLaundry.length > 0 || itemsReplaced.length > 0 || itemsLost.filter(i => i.item_type === 'linen').length > 0 || itemsMissing.filter(i => i.reason === 'shortage').length > 0) && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Shirt className="h-3 w-3 text-blue-600" />
                        <span>Đồ vải</span>
                      </div>
                      <div className="pl-5 space-y-0.5 text-xs text-muted-foreground">
                        {itemsSentToLaundry.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Send className="h-3 w-3" />
                            <span>Giặt: {totalLaundry}</span>
                          </div>
                        )}
                        {itemsReplaced.length > 0 && (
                          <div className="flex items-center gap-1">
                            <RefreshCw className="h-3 w-3" />
                            <span>Đổi: {totalReplaced}</span>
                          </div>
                        )}
                        {itemsLost.filter(i => i.item_type === 'linen').length > 0 && (
                          <div className="flex items-center gap-1 text-destructive">
                            <XCircle className="h-3 w-3" />
                            <span>Mất: {itemsLost.filter(i => i.item_type === 'linen').reduce((s, i) => s + i.quantity, 0)}</span>
                          </div>
                        )}
                        {itemsMissing.filter(i => i.reason === 'shortage').length > 0 && (
                          <div className="flex items-center gap-1 text-yellow-600">
                            <Minus className="h-3 w-3" />
                            <span>Thiếu: {itemsMissing.filter(i => i.reason === 'shortage').reduce((s, i) => s + i.shortage, 0)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Consumable Section */}
                  {itemsConsumed.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Droplets className="h-3 w-3 text-cyan-600" />
                        <span>Tiêu hao</span>
                      </div>
                      <div className="pl-5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          <span>Đã dùng: {totalConsumed}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Equipment/Furniture Section */}
                  {(itemsLost.filter(i => i.item_type === 'equipment' || i.item_type === 'furniture').length > 0 || itemsDamaged.length > 0) && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Tv className="h-3 w-3 text-purple-600" />
                        <span>Thiết bị/Nội thất</span>
                      </div>
                      <div className="pl-5 space-y-0.5 text-xs">
                        {itemsLost.filter(i => i.item_type === 'equipment' || i.item_type === 'furniture').length > 0 && (
                          <div className="flex items-center gap-1 text-destructive">
                            <XCircle className="h-3 w-3" />
                            <span>Mất: {itemsLost.filter(i => i.item_type === 'equipment' || i.item_type === 'furniture').length}</span>
                          </div>
                        )}
                        {itemsDamaged.length > 0 && (
                          <div className="flex items-center gap-1 text-yellow-600">
                            <Wrench className="h-3 w-3" />
                            <span>Hỏng: {totalDamaged}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Footer: ghi chú nghiệp vụ (không hiển thị chi phí trong luồng kiểm tra) */}
                  {(totalLost > 0 || totalDamaged > 0) && (
                    <div className="pt-2 border-t text-xs text-muted-foreground italic">
                      Đồ mất sẽ được bổ sung và báo cáo. Đồ hỏng sẽ tự sinh phiếu bảo trì "cần thay".
                    </div>
                  )}
                </>
              )}
              
              {!hasActions && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span>Không có vấn đề</span>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
      
      {/* Notes - Compact */}
      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm">Ghi chú</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Thêm ghi chú..."
                className="min-h-[60px] text-sm"
                maxLength={1000}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      
      {/* Photo Upload - Compact */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Ảnh</label>
          <span className="text-xs text-muted-foreground">{photos.length}/10</span>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {photos.map((url, index) => (
            <div key={index} className="relative group">
              <img
                src={url}
                alt={`Photo ${index + 1}`}
                className="h-16 w-16 rounded object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-destructive-foreground sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          
          {photos.length < 10 && (
            <>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                disabled={isUploading}
                className="hidden"
                id="photo-upload"
              />
              <label htmlFor="photo-upload">
                <div className={cn(
                  'h-16 w-16 rounded border-2 border-dashed flex items-center justify-center cursor-pointer',
                  'hover:border-primary hover:bg-muted/50 transition-colors',
                  isUploading && 'opacity-50 cursor-not-allowed'
                )}>
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <Camera className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
