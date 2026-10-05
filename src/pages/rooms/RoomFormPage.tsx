import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { buildRoomFormSchema, type RoomFormData } from '@/lib/rooms/roomFormSchema'
import { ArrowLeft, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuotaCheck } from '@/hooks/useQuotaCheck'
import { QuotaExceededDialog } from '@/components/settings/usage/QuotaExceededDialog'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { navigateBack } from '@/lib/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useRoom, useCreateRoom, useUpdateRoom } from '@/hooks/useRooms'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileRoomFormPage } from '@/components/rooms/MobileRoomFormPage'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { HotelBadge } from '@/components/layout/HotelBadge'
import { toast } from 'sonner'
import { useRoomSubscriptionLimit } from '@/hooks/useRoomSubscriptionLimit'
import { RoomLimitWarning } from '@/components/rooms/RoomLimitWarning'

// Build i18n schema from shared base — đảm bảo desktop và mobile dùng chung 1 nguồn
const createRoomSchema = (t: (key: string) => string) =>
  buildRoomFormSchema((k) => t(`rooms:form.validation.${k}`))

export function RoomFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const isEdit = !!id
  const { isMobile } = useBreakpoint()

  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const { data: roomData, isLoading: roomLoading } = useRoom(id)
  const createRoom = useCreateRoom()
  const updateRoom = useUpdateRoom()
  const quotaCheck = useQuotaCheck('room')
  const { canCreateRoom, isLoading: limitLoading } = useRoomSubscriptionLimit()
  
  const room = roomData?.room

  // Memoize schema to prevent recreation on every render
  const roomSchema = useMemo(() => createRoomSchema(t), [t])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RoomFormData>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      max_guests: 2,
      base_price: 0,
      has_window: true,
      has_balcony: false,
      smoking_allowed: false,
    },
  })

  // Reset form when room data loads (for edit mode)
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

  // Mobile view - AFTER all hooks
  if (isMobile) {
    return <MobileRoomFormPage />
  }

  const onSubmit = async (data: RoomFormData) => {
    // Prevent creation when in All Hotels mode
    if (isAllHotelsMode) {
      toast.error(t('rooms:form.toasts.allHotelsMode'))
      return
    }

    // Check if hotel is selected
    if (!selectedHotel?.id) {
      toast.error(t('rooms:form.toasts.selectHotelRequired'))
      return
    }

    // Check room subscription limit for new rooms
    if (!isEdit && !canCreateRoom) {
      toast.error('Đã đạt giới hạn phòng đăng ký. Vui lòng mua thêm phòng để tiếp tục.')
      return
    }

    // Check quota for new rooms
    if (!isEdit && !quotaCheck.checkQuota()) {
      return
    }

    // Check for duplicate room numbers in the same hotel
    const { data: existingRooms, error: checkError } = await supabase
      .from('rooms')
      .select('id, room_number')
      .eq('hotel_id', selectedHotel.id)
      .eq('room_number', data.room_number)

    if (checkError) {
      toast.error(t('rooms:form.toasts.duplicateError'))
      return
    }

    // If editing, exclude current room from duplicate check
    const duplicateExists = isEdit 
      ? existingRooms?.some(r => r.id !== id)
      : existingRooms && existingRooms.length > 0

    if (duplicateExists) {
      toast.error(t('rooms:form.toasts.duplicateExists', { roomNumber: data.room_number }))
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
        // Navigate back to detail page after editing
        navigate(`/rooms/${id}`)
      } else {
        const newRoom = await createRoom.mutateAsync({
          ...data,
          tenant_id: tenantId,
          hotel_id: selectedHotel.id,
          status: 'vacant_clean',
          amenities: [],
        })
        // Navigate to new room detail page after creating
        navigate(`/rooms/${newRoom.id}`)
      }
    } catch (error) {
      // Error handled by mutation
    }
  }

  if (roomLoading && isEdit) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/rooms')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">{t('rooms:form.loading')}</h1>
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
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/rooms')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">
              {isEdit ? t('rooms:form.edit') : t('rooms:form.create')}
            </h1>
            <p className="text-muted-foreground">
              {isEdit ? t('rooms:form.editDescription') : t('rooms:form.createDescription')}
            </p>
          </div>
          <HotelBadge />
        </div>

        {/* Alert for All Hotels Mode */}
        {isAllHotelsMode && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('rooms:form.alerts.allHotelsMode')}
            </AlertDescription>
          </Alert>
        )}

        {!isAllHotelsMode && !selectedHotel && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('rooms:form.alerts.noHotelSelected')}
            </AlertDescription>
          </Alert>
        )}

        {/* Room Subscription Limit Warning */}
        {!isEdit && <RoomLimitWarning variant="banner" />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('rooms:form.basicInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="room_number">{t('rooms:form.roomNumber')} *</Label>
                <Input id="room_number" {...register('room_number')} />
                {errors.room_number && (
                  <p className="text-sm text-destructive">{errors.room_number.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="room_type">{t('rooms:form.roomType')} *</Label>
                <Controller
                  control={control}
                  name="room_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('rooms:form.selectRoomType')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">{t('rooms:roomTypes.standard')}</SelectItem>
                        <SelectItem value="deluxe">{t('rooms:roomTypes.deluxe')}</SelectItem>
                        <SelectItem value="suite">{t('rooms:roomTypes.suite')}</SelectItem>
                        <SelectItem value="vip">{t('rooms:roomTypes.vip')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.room_type && (
                  <p className="text-sm text-destructive">{errors.room_type.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="floor">{t('rooms:form.floor')} *</Label>
                <Input
                  id="floor"
                  type="number" min={0}
                  {...register('floor', { valueAsNumber: true })}
                />
                {errors.floor && (
                  <p className="text-sm text-destructive">{errors.floor.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="area_sqm">{t('rooms:form.area')}</Label>
                <Input
                  id="area_sqm"
                  type="number" min={0}
                  step="0.01"
                  {...register('area_sqm', { valueAsNumber: true })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_guests">{t('rooms:form.maxGuests')} *</Label>
                <Input
                  id="max_guests"
                  type="number" min={1}
                  {...register('max_guests', { valueAsNumber: true })}
                />
                {errors.max_guests && (
                  <p className="text-sm text-destructive">{errors.max_guests.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="base_price">{t('rooms:form.basePrice')} *</Label>
                <Input
                  id="base_price"
                  type="number" min={0}
                  step="0.01"
                  {...register('base_price', { valueAsNumber: true })}
                />
                {errors.base_price && (
                  <p className="text-sm text-destructive">{errors.base_price.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('rooms:form.roomDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bed_type">{t('rooms:form.bedType')}</Label>
                <Controller
                  control={control}
                  name="bed_type"
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('rooms:form.selectBedType')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">{t('rooms:form.bedTypes.single')}</SelectItem>
                        <SelectItem value="double">{t('rooms:form.bedTypes.double')}</SelectItem>
                        <SelectItem value="queen">{t('rooms:form.bedTypes.queen')}</SelectItem>
                        <SelectItem value="king">{t('rooms:form.bedTypes.king')}</SelectItem>
                        <SelectItem value="twin">{t('rooms:form.bedTypes.twin')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="view_type">{t('rooms:form.viewType')}</Label>
                <Controller
                  control={control}
                  name="view_type"
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('rooms:form.selectViewType')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="city">{t('rooms:form.viewTypes.city')}</SelectItem>
                        <SelectItem value="sea">{t('rooms:form.viewTypes.sea')}</SelectItem>
                        <SelectItem value="mountain">{t('rooms:form.viewTypes.mountain')}</SelectItem>
                        <SelectItem value="garden">{t('rooms:form.viewTypes.garden')}</SelectItem>
                        <SelectItem value="pool">{t('rooms:form.viewTypes.pool')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="has_window"
                  checked={watch('has_window')}
                  onCheckedChange={(checked) => setValue('has_window', !!checked)}
                />
                <Label htmlFor="has_window" className="cursor-pointer">
                  {t('rooms:form.hasWindow')}
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="has_balcony"
                  checked={watch('has_balcony')}
                  onCheckedChange={(checked) => setValue('has_balcony', !!checked)}
                />
                <Label htmlFor="has_balcony" className="cursor-pointer">
                  {t('rooms:form.hasBalcony')}
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="smoking_allowed"
                  checked={watch('smoking_allowed')}
                  onCheckedChange={(checked) => setValue('smoking_allowed', !!checked)}
                />
                <Label htmlFor="smoking_allowed" className="cursor-pointer">
                  {t('rooms:form.smokingAllowed')}
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t('rooms:form.notes')}</Label>
              <Textarea id="notes" {...register('notes')} rows={3} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigateBack(navigate, '/rooms')}>
            {t('rooms:form.cancel')}
          </Button>
          <Button 
            type="submit" 
            disabled={isSubmitting || isAllHotelsMode || !selectedHotel || (!isEdit && !canCreateRoom)}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSubmitting ? t('rooms:form.saving') : isEdit ? t('rooms:form.update') : t('rooms:form.createNew')}
          </Button>
        </div>
      </form>
    </div>
    </>
  )
}
