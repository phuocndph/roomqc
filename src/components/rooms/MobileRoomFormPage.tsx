import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { roomFormSchema, type RoomFormData } from '@/lib/rooms/roomFormSchema'
import { navigateBack } from '@/lib/navigation'
import { ArrowLeft, Check, ChevronRight, Save } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useRoom, useCreateRoom, useUpdateRoom } from '@/hooks/useRooms'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useQuotaCheck } from '@/hooks/useQuotaCheck'
import { QuotaExceededDialog } from '@/components/settings/usage/QuotaExceededDialog'

// Schema dùng chung với desktop qua `@/lib/rooms/roomFormSchema`
const roomSchema = roomFormSchema

const STEPS = [
  { id: 1, title: 'Cơ bản', description: 'Số phòng, loại phòng' },
  { id: 2, title: 'Chi tiết', description: 'Giường, diện tích' },
  { id: 3, title: 'Tiện ích', description: 'Cửa sổ, ban công' },
]

export function MobileRoomFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const [currentStep, setCurrentStep] = useState(1)

  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const { data: roomData, isLoading: roomLoading } = useRoom(id)
  const createRoom = useCreateRoom()
  const updateRoom = useUpdateRoom()
  const quotaCheck = useQuotaCheck('room')
  
  const room = roomData?.room

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<RoomFormData>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      max_guests: 2,
      base_price: 0,
      floor: 1,
      has_window: true,
      has_balcony: false,
      smoking_allowed: false,
    },
  })

  useEffect(() => {
    if (room && isEdit) {
      reset({
        room_number: room.room_number || '',
        room_type: room.room_type || 'standard',
        floor: room.floor || 1,
        area_sqm: room.area_sqm || undefined,
        max_guests: room.max_guests || 2,
        base_price: room.base_price || 0,
        bed_type: room.bed_type || undefined,
        view_type: room.view_type || undefined,
        has_window: room.has_window ?? true,
        has_balcony: room.has_balcony ?? false,
        smoking_allowed: room.smoking_allowed ?? false,
        notes: room.notes || '',
      })
    }
  }, [room, isEdit, reset])

  const handleNextStep = async () => {
    let fieldsToValidate: (keyof RoomFormData)[] = []
    
    if (currentStep === 1) {
      fieldsToValidate = ['room_number', 'room_type', 'floor']
    } else if (currentStep === 2) {
      fieldsToValidate = ['max_guests', 'base_price']
    }
    
    const isValid = await trigger(fieldsToValidate)
    if (isValid && currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const onSubmit = async (data: RoomFormData) => {
    if (isAllHotelsMode) {
      toast.error('Vui lòng chọn một khách sạn cụ thể')
      return
    }

    if (!selectedHotel?.id) {
      toast.error('Vui lòng chọn khách sạn trước')
      return
    }

    if (!isEdit && !quotaCheck.checkQuota()) {
      return
    }

    // Check duplicate room number
    const { data: existingRooms, error: checkError } = await supabase
      .from('rooms')
      .select('id, room_number')
      .eq('hotel_id', selectedHotel.id)
      .eq('room_number', data.room_number)

    if (checkError) {
      toast.error('Lỗi kiểm tra số phòng')
      return
    }

    const duplicateExists = isEdit 
      ? existingRooms?.some(r => r.id !== id)
      : existingRooms && existingRooms.length > 0

    if (duplicateExists) {
      toast.error(`Số phòng "${data.room_number}" đã tồn tại`)
      return
    }

    try {
      if (isEdit) {
        await updateRoom.mutateAsync({
          id: id!,
          data: {
            ...data,
            updated_at: new Date().toISOString(),
          },
        })
        navigate(`/rooms/${id}`)
      } else {
        const newRoom = await createRoom.mutateAsync({
          ...data,
          tenant_id: tenantId,
          hotel_id: selectedHotel.id,
          status: 'vacant_clean',
          amenities: [],
        })
        navigate(`/rooms/${newRoom.id}`)
      }
    } catch (error) {
      // Error handled by mutation
    }
  }

  if (roomLoading && isEdit) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/rooms')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">Đang tải...</h1>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <QuotaExceededDialog
        open={quotaCheck.showDialog}
        onOpenChange={quotaCheck.setShowDialog}
        resourceType="room"
        currentUsage={quotaCheck.currentUsage}
        limit={quotaCheck.limit}
      />
      
      <div className="flex flex-col min-h-screen bg-background pb-20">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/rooms')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">
              {isEdit ? 'Sửa phòng' : 'Thêm phòng'}
            </h1>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                    currentStep === step.id 
                      ? "bg-primary text-primary-foreground"
                      : currentStep > step.id
                        ? "bg-green-500 text-white"
                        : "bg-muted text-muted-foreground"
                  )}>
                    {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
                  </div>
                  <span className={cn(
                    "text-xs mt-1",
                    currentStep === step.id ? "text-primary font-medium" : "text-muted-foreground"
                  )}>
                    {step.title}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={cn(
                    "w-12 h-0.5 mx-2",
                    currentStep > step.id ? "bg-green-500" : "bg-muted"
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        {isAllHotelsMode && (
          <Alert variant="destructive" className="m-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Vui lòng chọn một khách sạn cụ thể để tạo phòng.
            </AlertDescription>
          </Alert>
        )}

        {/* Form Content */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 p-4 space-y-4">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Thông tin cơ bản</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="room_number">Số phòng *</Label>
                  <Input 
                    id="room_number" 
                    {...register('room_number')} 
                    placeholder="VD: 101, A1..."
                    className="h-12 text-base"
                  />
                  {errors.room_number && (
                    <p className="text-sm text-destructive">{errors.room_number.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Loại phòng *</Label>
                  <Controller
                    control={control}
                    name="room_type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder="Chọn loại phòng" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="deluxe">Deluxe</SelectItem>
                          <SelectItem value="suite">Suite</SelectItem>
                          <SelectItem value="vip">VIP</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.room_type && (
                    <p className="text-sm text-destructive">{errors.room_type.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="floor">Tầng *</Label>
                  <Input
                    id="floor"
                    type="number" min={0}
                    {...register('floor', { valueAsNumber: true })}
                    className="h-12 text-base"
                  />
                  {errors.floor && (
                    <p className="text-sm text-destructive">{errors.floor.message}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Details */}
          {currentStep === 2 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Chi tiết phòng</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="max_guests">Số khách tối đa *</Label>
                    <Input
                      id="max_guests"
                      type="number" min={1}
                      {...register('max_guests', { valueAsNumber: true })}
                      className="h-12 text-base"
                    />
                    {errors.max_guests && (
                      <p className="text-sm text-destructive">{errors.max_guests.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="area_sqm">Diện tích (m²)</Label>
                    <Input
                      id="area_sqm"
                      type="number" min={0}
                      step="0.01"
                      {...register('area_sqm', { valueAsNumber: true })}
                      className="h-12 text-base"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="base_price">Giá cơ bản (₫) *</Label>
                  <Input
                    id="base_price"
                    type="number" min={0}
                    {...register('base_price', { valueAsNumber: true })}
                    className="h-12 text-base"
                  />
                  {errors.base_price && (
                    <p className="text-sm text-destructive">{errors.base_price.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Loại giường</Label>
                  <Controller
                    control={control}
                    name="bed_type"
                    render={({ field }) => (
                      <Select value={field.value || ''} onValueChange={field.onChange}>
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder="Chọn loại giường" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Đơn</SelectItem>
                          <SelectItem value="double">Đôi</SelectItem>
                          <SelectItem value="queen">Queen</SelectItem>
                          <SelectItem value="king">King</SelectItem>
                          <SelectItem value="twin">Twin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Hướng nhìn</Label>
                  <Controller
                    control={control}
                    name="view_type"
                    render={({ field }) => (
                      <Select value={field.value || ''} onValueChange={field.onChange}>
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder="Chọn hướng nhìn" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="city">Thành phố</SelectItem>
                          <SelectItem value="sea">Biển</SelectItem>
                          <SelectItem value="mountain">Núi</SelectItem>
                          <SelectItem value="garden">Vườn</SelectItem>
                          <SelectItem value="pool">Hồ bơi</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Amenities */}
          {currentStep === 3 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tiện ích & Ghi chú</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg">
                    <Checkbox
                      id="has_window"
                      checked={watch('has_window')}
                      onCheckedChange={(checked) => setValue('has_window', !!checked)}
                      className="h-5 w-5"
                    />
                    <Label htmlFor="has_window" className="cursor-pointer flex-1">
                      Có cửa sổ
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg">
                    <Checkbox
                      id="has_balcony"
                      checked={watch('has_balcony')}
                      onCheckedChange={(checked) => setValue('has_balcony', !!checked)}
                      className="h-5 w-5"
                    />
                    <Label htmlFor="has_balcony" className="cursor-pointer flex-1">
                      Có ban công
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg">
                    <Checkbox
                      id="smoking_allowed"
                      checked={watch('smoking_allowed')}
                      onCheckedChange={(checked) => setValue('smoking_allowed', !!checked)}
                      className="h-5 w-5"
                    />
                    <Label htmlFor="smoking_allowed" className="cursor-pointer flex-1">
                      Cho phép hút thuốc
                    </Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Ghi chú</Label>
                  <Textarea 
                    id="notes" 
                    {...register('notes')} 
                    rows={4}
                    placeholder="Thông tin bổ sung về phòng..."
                    className="text-base"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </form>

        {/* Fixed Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 safe-area-bottom">
          <div className="flex gap-3">
            {currentStep > 1 ? (
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1 h-12"
                onClick={handlePrevStep}
              >
                Quay lại
              </Button>
            ) : (
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1 h-12"
                onClick={() => navigateBack(navigate, '/rooms')}
              >
                Hủy
              </Button>
            )}
            
            {currentStep < 3 ? (
              <Button 
                type="button"
                className="flex-1 h-12"
                onClick={handleNextStep}
              >
                Tiếp theo
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button 
                type="submit"
                className="flex-1 h-12"
                disabled={isSubmitting || isAllHotelsMode || !selectedHotel}
                onClick={handleSubmit(onSubmit)}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSubmitting ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo phòng'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
