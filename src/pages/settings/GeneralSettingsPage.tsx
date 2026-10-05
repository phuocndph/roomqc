import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { useTenant } from '@/hooks/useTenant'
import { useUser } from '@/hooks/useUser'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Loader2, Save, Building2, Globe, Database, AlertTriangle, History } from 'lucide-react'
import { UnsavedChangesPrompt } from '@/components/settings/UnsavedChangesPrompt'
import { useAutoSave } from '@/hooks/useAutoSave'
import { logUpdate } from '@/lib/activityLogger'
import { SeedDataButton } from '@/components/settings/SeedDataButton'
import { Switch } from '@/components/ui/switch'
import { UsageModeSelector } from '@/components/settings/UsageModeSelector'
import { HotelQcModeSettings } from '@/components/settings/HotelQcModeSettings'
import { HotelPhotoEvidenceSettings } from '@/components/settings/HotelPhotoEvidenceSettings'
import { BackupHistoryDialog } from '@/components/settings/BackupHistoryDialog'
import { getFriendlyError } from '@/lib/errorMessage'
import { runtimeConfig } from '@/lib/runtime-config'

const createGeneralSettingsSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(2, t('settings:general.validation.companyNameMin')),
  email: z.string().email(t('settings:general.validation.emailInvalid')),
  phone: z.string().optional(),
  settings: z.object({
    timezone: z.string().default('Asia/Ho_Chi_Minh'),
    language: z.enum(['vi', 'en']).default('vi'),
    currency: z.string().default('VND'),
    date_format: z.string().default('DD/MM/YYYY'),
  }),
})

type GeneralSettingsForm = z.infer<ReturnType<typeof createGeneralSettingsSchema>>

export function GeneralSettingsPage() {
  const { t } = useTranslation(['settings', 'common'])
  const { tenant, isLoading } = useTenant()
  const { role } = useUser()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [enableAutoSave, setEnableAutoSave] = useState(false)
  const [backupHistoryOpen, setBackupHistoryOpen] = useState(false)

  const generalSettingsSchema = createGeneralSettingsSchema(t)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<GeneralSettingsForm>({
    resolver: zodResolver(generalSettingsSchema),
    values: tenant ? {
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone || '',
      settings: {
        timezone: (tenant.settings as any)?.timezone || 'Asia/Ho_Chi_Minh',
        language: (tenant.settings as any)?.language || 'vi',
        currency: (tenant.settings as any)?.currency || 'VND',
        date_format: (tenant.settings as any)?.date_format || 'DD/MM/YYYY',
      },
    } : undefined,
  })

  const formData = watch()

  // Auto-save
  useAutoSave({
    data: formData,
    onSave: async (data) => {
      if (!tenant) return
      
      const oldValues = {
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        settings: tenant.settings,
      }

      await supabase
        .from('tenants')
        .update({
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          settings: data.settings,
        })
        .eq('id', tenant.id)

      // Log the activity
      await logUpdate('tenant_settings', tenant.id, 'Cài đặt chung', oldValues, data)
    },
    enabled: enableAutoSave && isDirty,
  })

  const onSubmit = async (data: GeneralSettingsForm) => {
    if (!tenant) return

    setIsSaving(true)
    try {
      const oldValues = {
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        settings: tenant.settings,
      }

      const { error } = await supabase
        .from('tenants')
        .update({
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          settings: data.settings,
        })
        .eq('id', tenant.id)

      if (error) throw error

      // Log the activity
      await logUpdate('tenant_settings', tenant.id, t('settings:general.title'), oldValues, data)

      toast({
        title: t('settings:general.saved'),
        description: t('settings:general.savedDescription'),
      })
    } catch (error: any) {
      toast({
        title: t('settings:general.error'),
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 px-3 sm:px-0 pb-4 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="pb-2 border-b min-w-0">
        <h1 className="text-lg font-semibold truncate">{t('settings:general.pageTitle')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5 break-words">
          {t('settings:general.pageDescription')}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Company Information */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-medium">{t('settings:general.companyInfo.title')}</h2>
              <p className="text-[10px] text-muted-foreground">{t('settings:general.companyInfo.description')}</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs">{t('settings:general.companyName')} *</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder={t('settings:general.companyNamePlaceholder')}
                className="h-8 text-sm"
              />
              {errors.name && (
                <p className="text-[10px] text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs">{t('settings:general.email')} *</Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  placeholder={t('settings:general.emailPlaceholder')}
                  className="h-8 text-sm"
                />
                {errors.email && (
                  <p className="text-[10px] text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs">{t('settings:general.phone')}</Label>
                <Input
                  id="phone"
                  {...register('phone')}
                  placeholder={t('settings:general.phonePlaceholder')}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Regional Settings */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-medium">{t('settings:general.regionalSettings.title')}</h2>
              <p className="text-[10px] text-muted-foreground">{t('settings:general.regionalSettings.description')}</p>
            </div>
          </div>
          
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('settings:general.timezone')}</Label>
              <Select
                value={watch('settings.timezone')}
                onValueChange={(value) => setValue('settings.timezone', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Ho_Chi_Minh">{t('settings:general.timezones.hoChiMinh')}</SelectItem>
                  <SelectItem value="Asia/Bangkok">{t('settings:general.timezones.bangkok')}</SelectItem>
                  <SelectItem value="Asia/Singapore">{t('settings:general.timezones.singapore')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t('settings:general.language')}</Label>
              <Select
                value={watch('settings.language')}
                onValueChange={(value: 'vi' | 'en') => setValue('settings.language', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vi">{t('settings:general.languages.vi')}</SelectItem>
                  <SelectItem value="en">{t('settings:general.languages.en')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t('settings:general.currency')}</Label>
              <Select
                value={watch('settings.currency')}
                onValueChange={(value) => setValue('settings.currency', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VND">{t('settings:general.currencies.VND')}</SelectItem>
                  <SelectItem value="USD">{t('settings:general.currencies.USD')}</SelectItem>
                  <SelectItem value="EUR">{t('settings:general.currencies.EUR')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t('settings:general.dateFormat')}</Label>
              <Select
                value={watch('settings.date_format')}
                onValueChange={(value) => setValue('settings.date_format', value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Data Backup */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Database className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-medium">Sao lưu dữ liệu</h2>
              <p className="text-[10px] text-muted-foreground">Xem và tải về các bản sao lưu đã tạo</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setBackupHistoryOpen(true)}
          >
            <History className="mr-1.5 h-3 w-3" />
            Xem lịch sử
          </Button>
        </div>

        {/* Usage Mode */}
        <UsageModeSelector />

        {/* QC Mode for housekeeping */}
        <HotelQcModeSettings />

        {/* Photo evidence requirement for room checks */}
        <HotelPhotoEvidenceSettings />

        {/* Demo data is deliberately hidden from production/VPS builds. */}
        {runtimeConfig.demoDataEnabled && (role === 'owner' || role === 'super_admin') && (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-base text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Dữ liệu mẫu
              </CardTitle>
              <CardDescription>
                Chỉ dùng trên môi trường phát triển để kiểm thử. Dữ liệu thêm vào không thể hoàn tác.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SeedDataButton />
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center gap-2 min-w-0">
            <Switch
              id="auto-save"
              checked={enableAutoSave}
              onCheckedChange={setEnableAutoSave}
              className="scale-90"
            />
            <Label htmlFor="auto-save" className="text-xs font-normal cursor-pointer truncate">
              {t('settings:general.autoSave')}
            </Label>
          </div>

          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
              {t('settings:general.cancel')}
            </Button>
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={isSaving || !isDirty}>
              {isSaving ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3 w-3" />
              )}
              {t('settings:general.saveChanges')}
            </Button>
          </div>
        </div>
      </form>

      <UnsavedChangesPrompt when={isDirty && !enableAutoSave} />

      <BackupHistoryDialog open={backupHistoryOpen} onOpenChange={setBackupHistoryOpen} />
    </div>
  )
}
