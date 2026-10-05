import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { 
  useCreateMaintenanceRequest, 
  useMaintenanceRequest, 
  useUpdateMaintenanceRequest 
} from '@/hooks/useMaintenanceRequests'
import { useRooms } from '@/hooks/useRooms'
import { useItems } from '@/hooks/useItems'
import { MobileMaintenanceRequestForm } from '@/components/maintenance/MobileMaintenanceRequestForm'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { useEffect, useState } from 'react'
import { ImageUpload } from '@/components/shared/ImageUpload'
import { useBreakpoint } from '@/lib/breakpoints'
import { useHotelContext } from '@/contexts/HotelContext'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

const requestSchema = z.object({
  issue_type: z.enum(['repair', 'replace', 'inspection', 'cleaning', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  title: z.string().min(10, 'Tiêu đề phải có ít nhất 10 ký tự').max(100),
  description: z.string().min(20, 'Mô tả phải có ít nhất 20 ký tự'),
  location: z.string().min(3, 'Vị trí phải có ít nhất 3 ký tự'),
  room_id: z.string().optional(),
  item_id: z.string().optional(),
  expected_completion_date: z.string().optional(),
  estimated_cost: z.number().optional(),
  photos: z.array(z.string()).optional(),
})

type RequestFormData = z.infer<typeof requestSchema>

export default function MaintenanceRequestForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const roomIdFromUrl = searchParams.get('roomId') || undefined
  const { isMobile } = useBreakpoint()
  const { t } = useTranslation('maintenance')
  const { t: tCommon } = useTranslation('common')
  const { isAllHotelsMode } = useHotelContext()
  const isEditMode = !!id
  
  const createRequest = useCreateMaintenanceRequest()
  const updateRequest = useUpdateMaintenanceRequest()
  const { data: existingRequest, isLoading } = useMaintenanceRequest(id || '')
  const { data: rooms } = useRooms({})
  const { data: items } = useItems({})

  const [photos, setPhotos] = useState<string[]>([])

  const form = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      issue_type: 'repair',
      priority: 'medium',
      title: '',
      description: '',
      location: '',
      room_id: roomIdFromUrl,
      photos: [],
    },
  })

  // useEffect phải gọi TRƯỚC điều kiện isMobile
  useEffect(() => {
    if (isEditMode && existingRequest) {
      form.reset({
        issue_type: existingRequest.issue_type as any,
        priority: existingRequest.priority as any,
        title: existingRequest.title,
        description: existingRequest.description,
        location: existingRequest.location,
        room_id: existingRequest.room_id || undefined,
        item_id: existingRequest.item_id || undefined,
        expected_completion_date: existingRequest.expected_completion_date || undefined,
        estimated_cost: existingRequest.estimated_cost || undefined,
        photos: existingRequest.photos || [],
      })
      setPhotos(existingRequest.photos || [])
    }
  }, [isEditMode, existingRequest, form])

  useEffect(() => {
    if (isEditMode || !roomIdFromUrl || !rooms) return
    const room = rooms.find((entry: any) => entry.id === roomIdFromUrl)
    form.setValue('room_id', roomIdFromUrl)
    if (room && !form.getValues('location')) {
      form.setValue('location', `Phòng ${room.room_number}`)
    }
  }, [form, isEditMode, roomIdFromUrl, rooms])

  // Kiểm tra mobile SAU KHI tất cả hooks đã được gọi
  if (isMobile) {
    return <MobileMaintenanceRequestForm />
  }

  const onSubmit = async (data: RequestFormData) => {
    const submitData = { ...data, photos }
    if (isEditMode && id) {
      await updateRequest.mutateAsync({ id, data: submitData })
    } else {
      await createRequest.mutateAsync(submitData)
    }
    navigate('/maintenance/requests')
  }

  if (isEditMode && (isLoading || !existingRequest)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditMode ? t('requests.edit') : t('requests.new')}
        description={isEditMode ? t('form.editDescription') : t('form.createDescription')}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {isAllHotelsMode && !isEditMode && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Vui lòng chọn một khách sạn cụ thể để tạo mới. Chế độ "Tất cả khách sạn" chỉ hỗ trợ xem dữ liệu.
              </AlertDescription>
            </Alert>
          )}
          {/* Issue Type & Priority */}
          <Card>
            <CardHeader>
              <CardTitle>{t('form.typeAndPriority')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="issue_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.issueTypeLabel')} *</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="grid grid-cols-2 md:grid-cols-5 gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="repair" id="repair" />
                          <Label htmlFor="repair" className="cursor-pointer">
                            🔧 {t('issueType.repair')}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="replace" id="replace" />
                          <Label htmlFor="replace" className="cursor-pointer">
                            🔄 {t('issueType.replace')}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="inspection" id="inspection" />
                          <Label htmlFor="inspection" className="cursor-pointer">
                            🔍 {t('issueType.inspection')}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="cleaning" id="cleaning" />
                          <Label htmlFor="cleaning" className="cursor-pointer">
                            🧹 {t('issueType.cleaning')}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="other" id="other" />
                          <Label htmlFor="other" className="cursor-pointer">
                            ➕ {t('issueType.other')}
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.priorityLabel')} *</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="grid grid-cols-2 md:grid-cols-4 gap-4"
                      >
                        <div className="flex items-center space-x-2 border p-3 rounded-lg">
                          <RadioGroupItem value="urgent" id="urgent" />
                          <Label htmlFor="urgent" className="cursor-pointer">
                            <div className="font-medium">🔴 {t('priority.urgent')}</div>
                            <div className="text-xs text-muted-foreground">{t('form.priorityUrgentTime')}</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 border p-3 rounded-lg">
                          <RadioGroupItem value="high" id="high" />
                          <Label htmlFor="high" className="cursor-pointer">
                            <div className="font-medium">🟠 {t('priority.high')}</div>
                            <div className="text-xs text-muted-foreground">{t('form.priorityHighTime')}</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 border p-3 rounded-lg">
                          <RadioGroupItem value="medium" id="medium" />
                          <Label htmlFor="medium" className="cursor-pointer">
                            <div className="font-medium">🟡 {t('priority.medium')}</div>
                            <div className="text-xs text-muted-foreground">{t('form.priorityMediumTime')}</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 border p-3 rounded-lg">
                          <RadioGroupItem value="low" id="low" />
                          <Label htmlFor="low" className="cursor-pointer">
                            <div className="font-medium">🟢 {t('priority.low')}</div>
                            <div className="text-xs text-muted-foreground">{t('form.priorityLowTime')}</div>
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Location & Item */}
          <Card>
            <CardHeader>
              <CardTitle>{t('form.locationAndItem')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="room_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('fields.room')}</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('form.roomPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {rooms?.map((room: any) => (
                              <SelectItem key={room.id} value={room.id}>
                                {t('form.roomDisplay', { number: room.room_number, floor: room.floor })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="item_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('fields.item')}</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('form.itemPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {items?.items?.map((item: any) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name} ({item.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.detailLocationLabel')} *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('form.detailLocationPlaceholder')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>{t('form.problemDescription')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.titleLabel')} *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('form.titleExamplePlaceholder')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.detailDescriptionLabel')} *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder={t('form.descriptionExamplePlaceholder')}
                        rows={5}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <Label>{t('form.imagesLabel')}</Label>
                <ImageUpload
                  images={photos}
                  onChange={setPhotos}
                  maxImages={5}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground">
                  {t('form.imagesHint')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/maintenance/requests')}>
              {tCommon('buttons.cancel')}
            </Button>
            <Button type="submit" disabled={createRequest.isPending || updateRequest.isPending || (isAllHotelsMode && !isEditMode)}>
              {createRequest.isPending || updateRequest.isPending 
                ? t('actions.processing') 
                : isEditMode ? tCommon('buttons.update') : t('actions.submit')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
