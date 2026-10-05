import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { userFormSchema, type UserFormData } from '@/lib/validations/user.schemas'
import { useHotels } from '@/hooks/useHotels'
import { useAvailableUserLevels } from '@/hooks/useUserLevels'
import { usePositions } from '@/hooks/usePositions'
import { useUser } from '@/hooks/useUser'
import { useManagersByHotel } from '@/hooks/useManagersByHotel'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Eye, EyeOff, Info, AlertTriangle, Plus } from 'lucide-react'
import { PositionManagementDialog } from './PositionManagementDialog'
import { UserWithRelations } from '@/types/database.types'

interface UserFormDialogProps {
  user?: UserWithRelations | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: UserFormData) => Promise<void>
}

export function UserFormDialog({
  user,
  open,
  onOpenChange,
  onSubmit,
}: UserFormDialogProps) {
  const { t } = useTranslation(['users', 'common'])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showPositionDialog, setShowPositionDialog] = useState(false)
  const { data: hotels, isLoading: hotelsLoading } = useHotels({ status: 'active' })
  const { data: userLevels, isLoading: levelsLoading } = useAvailableUserLevels()
  const { user: currentUser } = useUser()

  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      userLevelCode: 'staff',
      hotelId: null,
      positionId: null,
      reportsTo: null,
    },
  })
  
  const selectedLevel = form.watch('userLevelCode')
  const selectedHotelId = form.watch('hotelId')
  
  // Department managers use the manager position catalogue but receive a
  // distinct account level and app role.
  const positionLevel = selectedLevel === 'department_manager' ? 'manager' : selectedLevel
  const { data: positions } = usePositions(
    selectedLevel === 'tenant_owner' ? undefined : positionLevel as 'manager' | 'staff'
  )
  
  // Fetch managers for selected hotel when Owner is creating Staff
  const { data: hotelManagers, isFetching: isFetchingManagers } = useManagersByHotel(
    currentUser?.user_level_code === 'tenant_owner' && selectedLevel === 'staff' 
      ? selectedHotelId 
      : null
  )

  // Determine available user levels based on current user's level
  const getAvailableUserLevels = () => {
    if (!currentUser) return []
    
    const currentUserLevel = currentUser.user_level_code
    
    if (currentUserLevel === 'tenant_owner') {
      return userLevels?.filter(l =>
        l.code === 'manager' || l.code === 'department_manager' || l.code === 'staff'
      ) || []
    } else if (currentUserLevel === 'manager') {
      return userLevels?.filter(l => l.code === 'department_manager' || l.code === 'staff') || []
    } else if (currentUserLevel === 'department_manager') {
      return userLevels?.filter(l => l.code === 'staff') || []
    } else {
      return []
    }
  }

  const availableUserLevels = getAvailableUserLevels()

  // Reset form when dialog opens
  useEffect(() => {
    if (open && !user) {
      form.reset({
        fullName: '',
        email: '',
        password: '',
        userLevelCode: 'staff',
        hotelId: null,
        positionId: null,
        reportsTo: null,
      })
    }
  }, [open, user, form])

  // Reset reportsTo when hotel changes
  useEffect(() => {
    if (selectedHotelId) {
      form.setValue('reportsTo', null)
    }
  }, [selectedHotelId, form])

  // Check if hotel is required for both manager and staff
  const isHotelRequired = selectedLevel !== 'tenant_owner'

  // Check if position is required
  const isPositionRequired = selectedLevel !== 'tenant_owner'

  const handleFormSubmit = async (data: UserFormData) => {
    // Validate hotel requirement
    if (isHotelRequired && !data.hotelId) {
      form.setError('hotelId', {
        type: 'manual',
        message: t('users:validation.selectHotel'),
      })
      return
    }

    // Validate position requirement
    if (isPositionRequired && !data.positionId) {
      form.setError('positionId', {
        type: 'manual',
        message: t('users:validation.selectPosition'),
      })
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(data)
      onOpenChange(false)
    } catch (error) {
      console.error('Form submission error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getLevelLabel = (code: string) => {
    switch (code) {
      case 'tenant_owner':
        return t('users:userLevel.tenantOwner')
      case 'manager':
        return t('users:userLevel.manager')
      case 'department_manager':
        return t('users:userLevel.departmentManager', 'Quản lý bộ phận')
      case 'staff':
        return t('users:userLevel.staff')
      default:
        return code
    }
  }

  const getLevelDescription = (code: string) => {
    switch (code) {
      case 'manager':
        return t('users:userLevelDescription.manager')
      case 'department_manager':
        return t('users:userLevelDescription.departmentManager', 'Quản lý một bộ phận trong khách sạn')
      case 'staff':
        return t('users:userLevelDescription.staff')
      default:
        return ''
    }
  }

  if (levelsLoading || hotelsLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="lg" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {user ? t('users:form.editTitle') : t('users:form.title')}
            </DialogTitle>
            <DialogDescription>
              {user 
                ? t('users:form.editDescription')
                : t('users:form.description')
              }
            </DialogDescription>
          </DialogHeader>

          {currentUser && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {t('users:messages.reportsTo')}: <strong>{currentUser.full_name}</strong>
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
              {/* Full Name */}
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users:fields.fullName')} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t('users:form.fullNamePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users:fields.email')} *</FormLabel>
                    <FormControl>
                      <Input 
                        type="email" 
                        placeholder={t('users:form.emailPlaceholder')}
                        {...field} 
                        disabled={!!user}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password - only for new users */}
              {!user && (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('users:fields.password')} *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder={t('users:form.passwordPlaceholder')}
                            {...field}
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* User Level */}
              <FormField
                control={form.control}
                name="userLevelCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users:fields.userLevel')} *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!!user}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('users:form.selectLevel')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="z-[200]">
                        {availableUserLevels.map((level) => (
                          <SelectItem key={level.code} value={level.code}>
                            <div className="flex flex-col">
                              <span className="font-medium">{getLevelLabel(level.code)}</span>
                              {getLevelDescription(level.code) && (
                                <span className="text-xs text-muted-foreground">
                                  {getLevelDescription(level.code)}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Hotel - Required for managers */}
              <FormField
                control={form.control}
                name="hotelId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('users:fields.hotel')} {isHotelRequired && '*'}
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('users:form.selectHotel')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="z-[200]">
                        {hotels?.map((hotel) => (
                          <SelectItem key={hotel.id} value={hotel.id}>
                            {hotel.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Position - Required for managers and staff */}
              <FormField
                control={form.control}
                name="positionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('users:fields.position')} {isPositionRequired && '*'}
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                      disabled={!selectedLevel || selectedLevel === 'tenant_owner'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('users:form.selectPosition')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="z-[200]">
                        {positions?.map((position) => (
                          <SelectItem key={position.id} value={position.id}>
                            {position.name}
                          </SelectItem>
                        ))}
                        <div className="border-t mt-1 pt-1">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-primary hover:bg-accent rounded-sm cursor-pointer"
                            onClick={() => setShowPositionDialog(true)}
                          >
                            <Plus className="h-4 w-4" />
                            {t('users:form.createPosition')}
                          </button>
                        </div>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Manager Selection - Only for Owner creating Staff */}
              {currentUser?.user_level_code === 'tenant_owner' && selectedLevel === 'staff' && selectedHotelId && (
                <FormField
                  control={form.control}
                  name="reportsTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('users:form.selectManager')}</FormLabel>
                      
                      {/* Loading state when fetching managers */}
                      {isFetchingManagers ? (
                        <div className="flex items-center gap-2 py-2 text-muted-foreground">
                          <LoadingSpinner size="sm" />
                          <span className="text-sm">{t('users:form.loadingManagers')}</span>
                        </div>
                      ) : (
                        <>
                          {/* Warning when hotel has no managers */}
                          {hotelManagers?.length === 0 && (
                            <Alert variant="default" className="mb-2 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                              <AlertDescription className="text-amber-700 dark:text-amber-400">
                                {t('users:form.noManagersWarning')}
                              </AlertDescription>
                            </Alert>
                          )}
                          
                          <Select
                            onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                            value={field.value || 'none'}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={t('users:form.selectManager')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="z-[200]">
                              {/* Option for direct Owner management */}
                              <SelectItem value="none">
                                {t('users:form.noSupervisorOption')}
                              </SelectItem>
                              
                              {hotelManagers?.map((manager) => (
                                <SelectItem key={manager.id} value={manager.id}>
                                  {manager.full_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  {t('common:cancel')}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? t('common:processing') : user ? t('common:update') : t('users:form.createUser')}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <PositionManagementDialog 
        open={showPositionDialog} 
        onOpenChange={setShowPositionDialog} 
      />
    </>
  )
}
