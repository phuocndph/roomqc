import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { navigateBack } from '@/lib/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { useCreateMaintenanceRequest, useUpdateMaintenanceRequest } from '@/hooks/useMaintenanceRequests'
import { useRooms } from '@/hooks/useRooms'
import { useItems } from '@/hooks/useItems'
import { ChevronLeft, ChevronRight, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHotelContext } from '@/contexts/HotelContext'
import { Alert, AlertDescription } from '@/components/ui/alert'

const requestSchema = z.object({
  title: z.string().min(1, 'validation.titleRequired'),
  description: z.string().min(1, 'validation.descriptionRequired'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  issue_type: z.enum(['repair', 'replace', 'inspection', 'cleaning', 'other']),
  location: z.string().min(1, 'validation.locationRequired'),
  room_id: z.string().optional(),
  item_id: z.string().optional(),
})

type RequestFormData = z.infer<typeof requestSchema>

const PRIORITY_OPTIONS = [
  { value: 'low', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'medium', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'high', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'urgent', color: 'bg-red-100 text-red-800 border-red-200' },
]

const ISSUE_TYPE_OPTIONS = ['repair', 'replace', 'inspection', 'cleaning', 'other']

export const MobileMaintenanceRequestForm = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const roomIdFromUrl = searchParams.get('roomId') || ''
  const { t } = useTranslation('maintenance')
  const [currentStep, setCurrentStep] = useState(1)
  const { isAllHotelsMode } = useHotelContext()

  const STEPS = [
    { id: 1, title: t('form.steps.basicInfo') },
    { id: 2, title: t('form.steps.location') },
    { id: 3, title: t('form.steps.confirm') },
  ]

  const createRequest = useCreateMaintenanceRequest()
  const updateRequest = useUpdateMaintenanceRequest()
  const { data: rooms = [] } = useRooms({})
  const { data: items = [] } = useItems({})

  const form = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'medium',
      issue_type: 'repair',
      location: '',
      room_id: roomIdFromUrl,
      item_id: '',
    },
  })

  useEffect(() => {
    if (id || !roomIdFromUrl) return
    const room = rooms.find((entry: any) => entry.id === roomIdFromUrl)
    form.setValue('room_id', roomIdFromUrl)
    if (room && !form.getValues('location')) {
      form.setValue('location', `Phòng ${room.room_number}`)
    }
  }, [form, id, roomIdFromUrl, rooms])

  const onSubmit = async (data: RequestFormData) => {
    try {
      if (id) {
        await updateRequest.mutateAsync({ id, data })
      } else {
        await createRequest.mutateAsync(data)
      }
      navigate('/maintenance/requests')
    } catch (error) {
      console.error('Error submitting request:', error)
    }
  }

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1)
    } else {
      form.handleSubmit(onSubmit)()
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    } else {
      navigateBack(navigate, '/maintenance/requests')
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title={id ? t('requests.edit') : t('requests.new')}
        showBack
        onBack={handleBack}
      />

      <div className="p-4 space-y-4">
        {isAllHotelsMode && !id && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Vui lòng chọn một khách sạn cụ thể để tạo mới. Chế độ "Tất cả khách sạn" chỉ hỗ trợ xem dữ liệu.
            </AlertDescription>
          </Alert>
        )}
        {/* Step Indicator */}
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                    currentStep >= step.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
                </div>
                <span className="text-xs mt-1 text-center">{step.title}</span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1 mx-2 transition-colors',
                    currentStep > step.id ? 'bg-primary' : 'bg-muted'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Form Content */}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label>{t('form.titleLabel')} *</Label>
                  <Input
                    placeholder={t('form.titlePlaceholder')}
                    {...form.register('title')}
                  />
                  {form.formState.errors.title && (
                    <p className="text-sm text-destructive">
                      {t(form.formState.errors.title.message as string)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{t('form.descriptionLabel')} *</Label>
                  <Textarea
                    placeholder={t('form.descriptionPlaceholder')}
                    rows={4}
                    {...form.register('description')}
                  />
                  {form.formState.errors.description && (
                    <p className="text-sm text-destructive">
                      {t(form.formState.errors.description.message as string)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{t('form.priorityLabel')} *</Label>
                  <RadioGroup
                    value={form.watch('priority')}
                    onValueChange={(value) =>
                      form.setValue('priority', value as any)
                    }
                    className="grid grid-cols-2 gap-2"
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <Label
                        key={option.value}
                        className={cn(
                          'flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all',
                          form.watch('priority') === option.value
                            ? option.color
                            : 'bg-background border-border'
                        )}
                      >
                        <RadioGroupItem value={option.value} className="sr-only" />
                        <span className="text-sm font-medium">{t(`priority.${option.value}`)}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>{t('form.issueTypeLabel')} *</Label>
                  <Select
                    value={form.watch('issue_type')}
                    onValueChange={(value) =>
                      form.setValue('issue_type', value as any)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`issueType.${option}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Location & Item */}
          {currentStep === 2 && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label>{t('form.locationLabel')} *</Label>
                  <Input
                    placeholder={t('form.locationPlaceholder')}
                    {...form.register('location')}
                  />
                  {form.formState.errors.location && (
                    <p className="text-sm text-destructive">
                      {t(form.formState.errors.location.message as string)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{t('form.roomLabel')}</Label>
                  <Select
                    value={form.watch('room_id')}
                    onValueChange={(value) => form.setValue('room_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('form.roomPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {rooms.map((room: any) => (
                        <SelectItem key={room.id} value={room.id}>
                          {t('form.roomDisplay', { number: room.room_number, floor: room.floor })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('form.itemLabel')}</Label>
                  <Select
                    value={form.watch('item_id')}
                    onValueChange={(value) => form.setValue('item_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('form.itemPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(items) ? items : items?.items || []).map((item: any) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} ({item.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('fields.title')}</p>
                    <p className="font-medium">{form.watch('title')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('fields.description')}</p>
                    <p className="text-sm">{form.watch('description')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('fields.priority')}</p>
                      <p className="font-medium">
                        {t(`priority.${form.watch('priority')}`)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('fields.type')}</p>
                      <p className="font-medium">
                        {t(`issueType.${form.watch('issue_type')}`)}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('fields.location')}</p>
                    <p className="font-medium">{form.watch('location')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-3 sticky bottom-20 bg-background py-3 border-t">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleBack}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {currentStep === 1 ? t('actions.cancel') : t('actions.back')}
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={handleNext}
              disabled={createRequest.isPending || updateRequest.isPending || (isAllHotelsMode && !id)}
            >
              {currentStep === STEPS.length ? (
                createRequest.isPending || updateRequest.isPending ? (
                  t('actions.processing')
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    {t('actions.submit')}
                  </>
                )
              ) : (
                <>
                  {t('actions.next')}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
