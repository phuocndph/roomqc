import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'
import { useQuotaCheck } from '@/hooks/useQuotaCheck'
import { QuotaExceededDialog } from '@/components/settings/usage/QuotaExceededDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Hotel, HotelFormData, useCreateHotel, useUpdateHotel } from '@/hooks/useHotels'
import { ChevronLeft, ChevronRight, Upload, X, Loader2 } from 'lucide-react'
import { useUsers } from '@/hooks/useUsers'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Building2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { toast } from 'sonner'

interface HotelFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hotel?: Hotel | null
}

export function HotelFormDialog({ open, onOpenChange, hotel }: HotelFormDialogProps) {
  const { t } = useTranslation(['hotels', 'common'])
  const [step, setStep] = useState(1)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const createHotel = useCreateHotel()
  const updateHotel = useUpdateHotel()
  const { tenantId } = useUser()
  const { users } = useUsers()
  const quotaCheck = useQuotaCheck('hotel')

  const hotelSchema = z.object({
    code: z.string()
      .min(2, t('hotels:validation.codeMinLength'))
      .max(20, t('hotels:validation.codeMaxLength'))
      .regex(/^[A-Z0-9-]+$/, t('hotels:validation.codeFormat')),
    name: z.string().min(2, t('hotels:validation.nameMinLength')),
    type: z.enum(['hotel', 'resort', 'apartment', 'hostel', 'other']),
    city: z.string().min(1, t('hotels:validation.cityRequired')),
    country: z.string().min(1, t('hotels:validation.countryRequired')),
    total_rooms: z.coerce.number().min(1, t('hotels:validation.minRooms')),
    total_floors: z.coerce.number().min(1, t('hotels:validation.minFloors')),
    status: z.enum(['active', 'inactive', 'maintenance']),
    
    // Optional fields
    address: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email(t('hotels:validation.invalidEmail')).optional().or(z.literal('')),
    website: z.string().url(t('hotels:validation.invalidUrl')).optional().or(z.literal('')),
    manager_id: z.string().optional(),
    description: z.string().optional(),
  })

  // Filter managers from users
  const managers = users?.filter(u => 
    u.role === 'hotel_manager' || u.role === 'owner' || u.role === 'super_admin'
  ) || []

  const form = useForm<HotelFormData>({
    resolver: zodResolver(hotelSchema),
    defaultValues: {
      code: hotel?.code || '',
      name: hotel?.name || '',
      type: hotel?.type || 'hotel',
      city: hotel?.city || '',
      country: hotel?.country || 'Việt Nam',
      total_rooms: hotel?.total_rooms || 1,
      total_floors: hotel?.total_floors || 1,
      description: hotel?.description || '',
      status: hotel?.status || 'active',
      address: hotel?.address || '',
      state: hotel?.state || '',
      postal_code: hotel?.postal_code || '',
      phone: hotel?.phone || '',
      email: hotel?.email || '',
      website: hotel?.website || '',
      manager_id: hotel?.manager_id || undefined,
    },
  })

  useEffect(() => {
    if (open && hotel) {
      setLogoUrl(hotel.logo_url || null)
      form.reset({
        code: hotel.code,
        name: hotel.name,
        type: hotel.type,
        city: hotel.city || '',
        country: hotel.country,
        total_rooms: hotel.total_rooms,
        total_floors: hotel.total_floors,
        description: hotel.description || '',
        status: hotel.status,
        address: hotel.address || '',
        state: hotel.state || '',
        postal_code: hotel.postal_code || '',
        phone: hotel.phone || '',
        email: hotel.email || '',
        website: hotel.website || '',
        manager_id: hotel.manager_id || undefined,
      })
    } else if (open && !hotel) {
      setLogoUrl(null)
      form.reset({
        code: '',
        name: '',
        type: 'hotel',
        city: '',
        country: 'Việt Nam',
        total_rooms: 1,
        total_floors: 1,
        description: '',
        status: 'active',
        address: '',
        state: '',
        postal_code: '',
        phone: '',
        email: '',
        website: '',
        manager_id: undefined,
      })
    }
  }, [open, hotel, form])

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !tenantId) return

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo tối đa 2MB')
      return
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Chỉ chấp nhận file ảnh')
      return
    }

    setIsUploadingLogo(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${tenantId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

      const { data, error } = await supabase.storage
        .from('hotel-logos')
        .upload(fileName, file, { cacheControl: '3600', upsert: false })

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage
        .from('hotel-logos')
        .getPublicUrl(data.path)

      setLogoUrl(publicUrl)
    } catch (error) {
      console.error('Upload error:', error)
      toast.error('Lỗi khi tải logo lên')
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleRemoveLogo = () => {
    setLogoUrl(null)
  }

  const onSubmit = async (data: HotelFormData) => {
    // Check quota for new hotels
    if (!hotel && !quotaCheck.checkQuota()) {
      return
    }

    const submitData = { ...data, logo_url: logoUrl || undefined }
    if (hotel) {
      await updateHotel.mutateAsync({ id: hotel.id, data: submitData })
    } else {
      await createHotel.mutateAsync(submitData)
    }
    onOpenChange(false)
    setStep(1)
  }

  const handleClose = () => {
    onOpenChange(false)
    setStep(1)
  }

  const nextStep = async () => {
    const fields = getStepFields(step)
    const valid = await form.trigger(fields as any)
    if (valid) setStep(step + 1)
  }

  const prevStep = () => setStep(step - 1)

  const getStepFields = (currentStep: number): string[] => {
    switch (currentStep) {
      case 1:
        return ['code', 'name', 'type', 'city', 'country']
      case 2:
        return ['total_rooms', 'total_floors', 'status']
      default:
        return []
    }
  }

  const totalSteps = 2
  const progress = (step / totalSteps) * 100

  return (
    <>
      <QuotaExceededDialog
        open={quotaCheck.showDialog}
        onOpenChange={quotaCheck.setShowDialog}
        resourceType="hotel"
        currentUsage={quotaCheck.currentUsage}
        limit={quotaCheck.limit}
      />
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{hotel ? t('hotels:editHotel') : t('hotels:addNew')}</DialogTitle>
          <DialogDescription>
            {!hotel && t('hotels:form.step', { current: step, total: totalSteps })}
          </DialogDescription>
        </DialogHeader>

        {!hotel && <Progress value={progress} className="h-2" />}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Step 1: Thông tin cơ bản */}
            {(step === 1 || !!hotel) && (
              <div className="space-y-4">
                {/* Logo Upload */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="hotel-logo-upload"
                      disabled={isUploadingLogo}
                    />
                    <label htmlFor="hotel-logo-upload" className="cursor-pointer block">
                      <Avatar className="h-20 w-20 border-2 border-dashed border-muted-foreground/30 hover:border-primary transition-colors">
                        {isUploadingLogo ? (
                          <AvatarFallback>
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </AvatarFallback>
                        ) : logoUrl ? (
                          <AvatarImage src={logoUrl} alt="Hotel logo" />
                        ) : (
                          <AvatarFallback>
                            <Upload className="h-5 w-5 text-muted-foreground" />
                          </AvatarFallback>
                        )}
                      </Avatar>
                    </label>
                    {logoUrl && !isUploadingLogo && (
                      <button aria-label="Đóng"
                        type="button"
                        onClick={handleRemoveLogo}
                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">Logo (tùy chọn)</span>
                </div>

                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('hotels:fields.code')} *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder={t('hotels:form.codePlaceholder')}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('hotels:form.codeDescription')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('hotels:fields.name')} *</FormLabel>
                      <FormControl>
                        <Input placeholder={t('hotels:form.namePlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('hotels:fields.type')} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('hotels:form.selectType')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="hotel">{t('hotels:type.hotel')}</SelectItem>
                          <SelectItem value="resort">{t('hotels:type.resort')}</SelectItem>
                          <SelectItem value="apartment">{t('hotels:type.apartment')}</SelectItem>
                          <SelectItem value="hostel">{t('hotels:type.hostel')}</SelectItem>
                          <SelectItem value="other">{t('hotels:type.other')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('hotels:fields.city')} *</FormLabel>
                        <FormControl>
                          <Input placeholder={t('hotels:form.cityPlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('hotels:fields.country')} *</FormLabel>
                        <FormControl>
                          <Input placeholder={t('hotels:form.countryPlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Quy mô & Trạng thái */}
            {(step === 2 || !!hotel) && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="total_rooms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('hotels:fields.totalRooms')} *</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="total_floors"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('hotels:fields.totalFloors')} *</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('hotels:fields.status')} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('hotels:form.selectStatus')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">{t('hotels:status.active')}</SelectItem>
                          <SelectItem value="inactive">{t('hotels:status.inactive')}</SelectItem>
                          <SelectItem value="maintenance">{t('hotels:status.maintenance')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-4">
              {step > 1 && !hotel && (
                <Button type="button" variant="outline" onClick={prevStep}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  {t('common:back')}
                </Button>
              )}
              {step < totalSteps && !hotel && (
                <Button type="button" onClick={nextStep} className="ml-auto">
                  {t('common:next')}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {(step === totalSteps || hotel) && (
                <Button
                  type="submit"
                  disabled={createHotel.isPending || updateHotel.isPending}
                  className={!hotel && step > 1 ? 'ml-auto' : ''}
                >
                  {hotel ? t('common:update') : t('common:create')} {t('hotels:title').replace('Quản lý ', '').replace(' Management', '')}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    </>
  )
}
