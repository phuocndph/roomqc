import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { useTranslation } from 'react-i18next'
import { 
  ArrowLeft, 
  DoorOpen, 
  Shirt,
  Wrench,
  Trash2,
  PackageMinus,
  Search,
  Plus,
  Minus,
  X,
  Save,
  AlertTriangle,
  Check,
  Tag,
  Package,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  Building2,
  Star
} from 'lucide-react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TouchButton } from '@/components/mobile/TouchOptimized'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ImageUpload } from '@/components/shared/ImageUpload'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { WarehouseSelect } from '@/components/warehouse/WarehouseSelect'
import { MobileRoomSelectSheet } from './outbound/MobileRoomSelectSheet'
import { MobileMaintenanceSelectSheet } from './outbound/MobileMaintenanceSelectSheet'
import { MobileLaundryVendorStep, MobileLaundryDeliveryStep, validateLaundryData } from './outbound/MobileLaundrySteps'
import { useOutboundSubmit } from './outbound/shared/useOutboundSubmit'
import { OutboundCategoryGrid, type OutboundCategoryOption } from './outbound/shared/OutboundCategoryGrid'
import { useItems } from '@/hooks/useItems'
import { useDefaultWarehouse } from '@/hooks/useWarehouses'
import { useMultipleWarehouseStock } from '@/hooks/useWarehouseStock'
import { useRooms } from '@/hooks/useRooms'
import { useLaundryVendors } from '@/hooks/useLaundryVendors'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { triggerHaptic } from '@/lib/haptics'

const DRAFT_KEY = 'outbound_form_draft'

type OutboundCategory = 'room_assign' | 'laundry' | 'maintenance' | 'disposal' | 'other'

interface LaundryFormData {
  vendor_id: string
  delivery_date: Date
  expected_return_date: Date
  delivery_staff_id: string
  receiver_name: string
  notes?: string
}

interface MaintenanceRequestRef {
  id: string
  title: string
  room_number?: string
}

const createOutboundSchema = (t: (key: string) => string) => z.object({
  transaction_category: z.enum(['room_assign', 'laundry', 'maintenance', 'disposal', 'other']),
  from_warehouse_id: z.string().uuid(t('inventory:mobileForm.validation.fromLocationRequired')),
  to_location: z.string().optional(),
  items: z.array(z.object({
    item_id: z.string().uuid(t('inventory:mobileForm.validation.itemRequired')),
    quantity: z.number().min(1, t('inventory:mobileForm.validation.quantityMin')),
    available_quantity: z.number(),
    notes: z.string().optional(),
    weight_kg: z.number().optional(),
  })).min(1, t('inventory:mobileForm.validation.minOneItem')),
  recipient_name: z.string().optional(),
  photos: z.array(z.string()).optional(),
  notes: z.string().optional(),
})

type OutboundFormData = z.infer<ReturnType<typeof createOutboundSchema>>

// Helper to get steps based on category
function getStepsForCategory(category: OutboundCategory, t: (key: string) => string) {
  switch (category) {
    case 'room_assign':
      return [
        { key: 'category', icon: Tag, label: t('inventory:mobileForm.steps.categoryLocation') },
        { key: 'rooms', icon: DoorOpen, label: t('inventory:outbound.step.selectRooms') },
        { key: 'items', icon: Package, label: t('inventory:mobileForm.steps.items') },
        { key: 'confirm', icon: CheckCircle, label: t('inventory:mobileForm.steps.confirm') },
      ]
    case 'laundry':
      return [
        { key: 'category', icon: Tag, label: t('inventory:mobileForm.steps.categoryLocation') },
        { key: 'vendor', icon: Building2, label: t('inventory:outbound.step.selectVendor') },
        { key: 'delivery', icon: Shirt, label: t('inventory:outbound.step.deliveryInfo') },
        { key: 'items', icon: Package, label: t('inventory:mobileForm.steps.items') },
        { key: 'confirm', icon: CheckCircle, label: t('inventory:mobileForm.steps.confirm') },
      ]
    case 'maintenance':
      return [
        { key: 'category', icon: Tag, label: t('inventory:mobileForm.steps.categoryLocation') },
        { key: 'request', icon: Wrench, label: t('inventory:outbound.step.selectRequest') },
        { key: 'items', icon: Package, label: t('inventory:mobileForm.steps.items') },
        { key: 'confirm', icon: CheckCircle, label: t('inventory:mobileForm.steps.confirm') },
      ]
    default: // disposal, other
      return [
        { key: 'category', icon: Tag, label: t('inventory:mobileForm.steps.categoryLocation') },
        { key: 'items', icon: Package, label: t('inventory:mobileForm.steps.items') },
        { key: 'confirm', icon: CheckCircle, label: t('inventory:mobileForm.steps.confirm') },
      ]
  }
}

export function MobileOutboundForm() {
  const { t } = useTranslation(['inventory', 'common', 'laundry', 'rooms', 'maintenance'])
  const navigate = useNavigate()
  // wizard removed — form is single-page
  const [searchQuery, setSearchQuery] = useState('')
  const [showItemSelector, setShowItemSelector] = useState(false)
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [showRoomSelector, setShowRoomSelector] = useState(false)
  const [showMaintenanceSelector, setShowMaintenanceSelector] = useState(false)
  const [shake, setShake] = useState(false)
  
  // Category-specific state
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([])
  const [selectedMaintenanceRequest, setSelectedMaintenanceRequest] = useState<MaintenanceRequestRef | null>(null)
  const [laundryData, setLaundryData] = useState<LaundryFormData | null>(null)

  const categories: OutboundCategoryOption[] = [
    { value: 'room_assign', label: t('inventory:outbound.categories.room_assign'), icon: DoorOpen, description: t('inventory:outbound.categories.room_assignDesc') },
    { value: 'laundry', label: t('inventory:outbound.categories.laundry'), icon: Shirt, description: t('inventory:outbound.categories.laundryDesc') },
    { value: 'maintenance', label: t('inventory:outbound.categories.maintenance'), icon: Wrench, description: t('inventory:outbound.categories.maintenanceDesc') },
    { value: 'disposal', label: t('inventory:outbound.categories.disposal'), icon: Trash2, description: t('inventory:outbound.categories.disposalDesc') },
    { value: 'other', label: t('inventory:outbound.categories.other'), icon: PackageMinus, description: t('inventory:outbound.categories.otherDesc') },
  ]

  const { submit: submitOutbound, isPending: isLoading } = useOutboundSubmit()
  const { data: itemsData, isLoading: isLoadingItems } = useItems({ search: searchQuery }, 1, 50)
  const { data: defaultWarehouse } = useDefaultWarehouse()
  const { data: rooms = [] } = useRooms({})
  const { data: vendors = [] } = useLaundryVendors({ status: 'active' })

  
  const outboundSchema = createOutboundSchema(t)

  const form = useForm<OutboundFormData>({
    resolver: zodResolver(outboundSchema),
    defaultValues: {
      transaction_category: 'room_assign',
      from_warehouse_id: '',
      to_location: '',
      items: [],
      recipient_name: '',
      photos: [],
      notes: '',
    },
  })
  
  const category = form.watch('transaction_category') as OutboundCategory
  const steps = useMemo(() => getStepsForCategory(category, t), [category, t])


  
  // Set default warehouse when loaded
  const fromWarehouseId = form.watch('from_warehouse_id')
  useEffect(() => {
    if (defaultWarehouse && !fromWarehouseId) {
      form.setValue('from_warehouse_id', defaultWarehouse.id)
    }
  }, [defaultWarehouse, fromWarehouseId, form])
  
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })
  
  const watchedItemsValue = form.watch('items')
  const watchedItems = useMemo(() => watchedItemsValue ?? [], [watchedItemsValue])
  const to_location = form.watch('to_location')
  const totalQuantity = watchedItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
  
  // Get warehouse stock for selected items
  const itemIds = watchedItems.map(i => i.item_id).filter(Boolean)
  const { data: warehouseStockMap } = useMultipleWarehouseStock(fromWarehouseId, itemIds)
  
  const hasStockError = watchedItems.some(item => {
    const warehouseQty = warehouseStockMap?.[item.item_id]?.quantity || 0
    return item.quantity > warehouseQty
  })
  const lowStockWarnings = watchedItems.filter(
    item => {
      const warehouseQty = warehouseStockMap?.[item.item_id]?.quantity || 0
      return warehouseQty > 0 && (warehouseQty - item.quantity) < 10
    }
  )
  
  // Reset category-specific state when category changes
  useEffect(() => {
    setSelectedRoomIds([])
    setSelectedMaintenanceRequest(null)
    setLaundryData(null)
  }, [category])

  
  // Load draft on mount
  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY)
    if (draft) {
      try {
        const data = JSON.parse(draft)
        form.reset(data)
        toast.info(t('inventory:mobileForm.draftRestored'), {
          action: {
            label: t('inventory:mobileForm.clearDraft'),
            onClick: () => {
              localStorage.removeItem(DRAFT_KEY)
              form.reset({
                transaction_category: 'room_assign',
                from_warehouse_id: defaultWarehouse?.id || '',
                to_location: '',
                items: [],
                recipient_name: '',
                photos: [],
                notes: '',
              })
            }
          }
        })
      } catch { /* ignore an unavailable or malformed saved draft */ }
    }
  }, [defaultWarehouse?.id, form, t])
  
  // Auto-save draft (debounced)
  useEffect(() => {
    const subscription = form.watch((data) => {
      const timer = setTimeout(() => {
        if (form.formState.isDirty) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
        }
      }, 1000)
      return () => clearTimeout(timer)
    })
    return () => subscription.unsubscribe()
  }, [form, form.formState.isDirty])
  
  // Per-step validator (now used to validate ALL steps at submit time, since
  // the form renders single-page — no wizard gating).
  const validateStep = useCallback((stepKey: string | undefined): { isValid: boolean; error?: string } => {
    if (stepKey === 'category') {
      if (!fromWarehouseId) return { isValid: false, error: t('inventory:mobileForm.validation.fromLocationRequired') }
      if ((category === 'disposal' || category === 'other') && !to_location?.trim()) {
        return { isValid: false, error: t('inventory:mobileForm.validation.toLocationRequired') }
      }
      return { isValid: true }
    }

    if (stepKey === 'rooms') {
      if (selectedRoomIds.length === 0) return { isValid: false, error: t('inventory:outbound.noRoomSelected') }
      return { isValid: true }
    }

    if (stepKey === 'vendor') {
      if (!laundryData?.vendor_id) return { isValid: false, error: t('laundry:createBatch.validation.selectVendor') }
      return { isValid: true }
    }

    if (stepKey === 'delivery') {
      const validation = validateLaundryData(laundryData)
      if (!validation.isValid) return { isValid: false, error: validation.error }
      return { isValid: true }
    }

    if (stepKey === 'request') {
      return { isValid: true }
    }

    if (stepKey === 'items') {
      if (hasStockError) return { isValid: false, error: t('inventory:mobileForm.validation.exceededStock') }
      if (watchedItems.length === 0) return { isValid: false, error: t('inventory:mobileForm.validation.addAtLeastOneItem') }
      if (!watchedItems.every(item => item.item_id && item.quantity > 0)) {
        return { isValid: false, error: t('inventory:mobileForm.validation.checkInfo') }
      }
      return { isValid: true }
    }

    return { isValid: true }
  }, [fromWarehouseId, to_location, category, selectedRoomIds, laundryData, hasStockError, watchedItems, t])

  // Aggregate "can submit?" status across every step — drives the sticky submit button.
  const allStepsValid = useMemo(() => {
    return steps.every(s => validateStep(s.key).isValid)
  }, [steps, validateStep])

  const handleBack = () => {
    if (form.formState.isDirty) {
      setShowExitDialog(true)
    } else {
      navigateBack(navigate, '/inventory')
    }
  }

  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form.getValues()))
    triggerHaptic('success')
    toast.success(t('inventory:mobileForm.draftSaved'))
    navigate('/inventory/transactions')
  }

  const handleDiscard = () => {
    localStorage.removeItem(DRAFT_KEY)
    navigateBack(navigate, '/inventory')
  }

  const handleSubmit = async () => {
    // Validate EVERY step (single-page form: all fields visible, but validators stayed per-section).
    for (const s of steps) {
      const v = validateStep(s.key)
      if (!v.isValid) {
        triggerHaptic('error')
        setShake(true)
        setTimeout(() => setShake(false), 500)
        toast.error(v.error || t('inventory:mobileForm.validation.checkInfo'))
        return
      }
    }

    if (hasStockError) {
      toast.error(t('inventory:mobileForm.validation.exceededStock'))
      return
    }

    const formData = form.getValues()


    submitOutbound(
      {
        transaction_category: category,
        from_warehouse_id: formData.from_warehouse_id,
        to_location: formData.to_location,
        items: watchedItems.map(i => ({
          item_id: i.item_id,
          quantity: i.quantity,
          available_quantity: i.available_quantity,
          notes: i.notes,
          weight_kg: i.weight_kg,
        })),
        recipient_name: formData.recipient_name,
        photos: formData.photos,
        notes: formData.notes,
      },
      {
        selectedRoomIds,
        laundryData,
        selectedMaintenanceRequest,
      },
      {
        onSuccess: (kind) => {
          localStorage.removeItem(DRAFT_KEY)
          triggerHaptic('success')
          if (kind === 'distribution') {
            toast.success(t('inventory:mobileForm.outbound.successMessage'))
            navigate('/inventory/distributions')
          } else if (kind === 'laundry') {
            toast.success(t('laundry:messages.createSuccess'))
            navigate('/laundry/batches')
          } else {
            toast.success(t('inventory:mobileForm.outbound.successMessage'))
            navigate('/inventory/transactions')
          }
        },
        onError: () => {
          // Lỗi đã được mutation hook hiển thị toast — không log ra console.
        },
      },
    )
  }
  
  const addItem = (itemId: string, availableQty: number) => {
    const existing = watchedItems.find(i => i.item_id === itemId)
    if (existing) {
      toast.info(t('inventory:mobileForm.itemAlreadyAdded'))
      return
    }
    
    triggerHaptic('success')
    append({
      item_id: itemId,
      quantity: 1,
      available_quantity: availableQty,
      notes: '',
      weight_kg: 0,
    })
    
    setShowItemSelector(false)
  }
  
  const handleRemoveItem = (index: number) => {
    triggerHaptic('warning')
    remove(index)
  }
  
  const updateQuantity = (index: number, quantity: number) => {
    const newQty = Math.max(1, quantity)
    form.setValue(`items.${index}.quantity`, newQty, {
      shouldDirty: true,
      shouldValidate: true
    })
    if (quantity >= 1) triggerHaptic('light')
  }
  
  const selectedCategory = categories.find(c => c.value === category)
  const selectedVendor = vendors.find(v => v.id === laundryData?.vendor_id)
  const selectedRooms = rooms.filter(r => selectedRoomIds.includes(r.id))
  
  // Render content for a given step. Now invoked for every step in `steps`,
  // so the whole form renders on a single scrollable page (no wizard hiding).
  const renderStepContent = (stepKey: string) => {

    
    // Step: Category Selection & Warehouse
    if (stepKey === 'category') {
      return (
        <motion.div
          key="step-category"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className={cn("p-4 space-y-6", shake && "animate-shake")}
        >
          <div>
            <h2 className="text-lg font-semibold mb-1">{t('inventory:mobileForm.outbound.categoryTitle')}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t('inventory:mobileForm.outbound.categoryDescription')}</p>
            
            <OutboundCategoryGrid
              value={category}
              onChange={(value) => {
                form.setValue('transaction_category', value as any)
                triggerHaptic('light')
              }}
              options={categories}
              variant="wizard"
            />

          </div>
          
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{t('inventory:mobileForm.outbound.locationTitle')}</h2>
            
            <div className="space-y-3">
              <div>
                <Label>{t('inventory:mobileForm.outbound.fromLocation')} *</Label>
                <WarehouseSelect
                  value={fromWarehouseId}
                  onValueChange={(value) => form.setValue('from_warehouse_id', value)}
                  placeholder={t('inventory:mobileForm.outbound.fromPlaceholder')}
                  error={!!form.formState.errors.from_warehouse_id}
                  className="mt-1"
                />
              </div>
              
              {/* Only show to_location for disposal/other */}
              {(category === 'disposal' || category === 'other') && (
                <div>
                  <Label htmlFor="to_location">{t('inventory:mobileForm.outbound.toLocation')} *</Label>
                  <Input 
                    id="to_location"
                    placeholder={t('inventory:mobileForm.outbound.toPlaceholder')}
                    className={cn(
                      "min-h-[48px] mt-1",
                      form.formState.errors.to_location && "border-destructive"
                    )}
                    {...form.register('to_location')}
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )
    }
    
    // Step: Room Selection (for room_assign)
    if (stepKey === 'rooms') {
      return (
        <motion.div
          key="step-rooms"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className={cn("p-4 space-y-4", shake && "animate-shake")}
        >
          <div>
            <h2 className="text-lg font-semibold mb-1">{t('inventory:outbound.selectRooms')}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t('inventory:outbound.roomAssignDescription')}</p>
          </div>
          
          {/* Selected Rooms Display */}
          {selectedRoomIds.length > 0 && (
            <div className="space-y-2">
              <Label>{t('inventory:mobileForm.selected')} ({selectedRoomIds.length})</Label>
              <div className="flex flex-wrap gap-2">
                {selectedRooms.map(room => (
                  <Badge key={room.id} variant="secondary" className="h-8 gap-1">
                    <DoorOpen className="h-3 w-3" />
                    {room.room_number}
                    <button
                      type="button"
                      onClick={() => setSelectedRoomIds(prev => prev.filter(id => id !== room.id))}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          <TouchButton
            variant="outline"
            className="w-full h-14 justify-between"
            onClick={() => setShowRoomSelector(true)}
          >
            <div className="flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-muted-foreground" />
              <span>
                {selectedRoomIds.length > 0
                  ? t('inventory:outbound.roomSelected', { count: selectedRoomIds.length })
                  : t('inventory:outbound.placeholders.selectRoom')
                }
              </span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </TouchButton>
        </motion.div>
      )
    }
    
    // Step: Vendor Selection (for laundry)
    if (stepKey === 'vendor') {
      return (
        <MobileLaundryVendorStep
          form={form}
          laundryData={laundryData}
          onUpdateLaundryData={(data) => setLaundryData(prev => prev ? { ...prev, ...data } : {
            vendor_id: '',
            delivery_date: new Date(),
            expected_return_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            delivery_staff_id: '',
            receiver_name: '',
            ...data
          })}
        />
      )
    }
    
    // Step: Delivery Info (for laundry)
    if (stepKey === 'delivery') {
      return (
        <MobileLaundryDeliveryStep
          form={form}
          laundryData={laundryData}
          onUpdateLaundryData={(data) => setLaundryData(prev => prev ? { ...prev, ...data } : null)}
        />
      )
    }
    
    // Step: Maintenance Request Selection
    if (stepKey === 'request') {
      return (
        <motion.div
          key="step-request"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className={cn("p-4 space-y-4", shake && "animate-shake")}
        >
          <div>
            <h2 className="text-lg font-semibold mb-1">{t('inventory:outbound.selectMaintenanceRequest')}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t('inventory:outbound.maintenanceDescription')}</p>
          </div>
          
          {/* Selected Request Display */}
          {selectedMaintenanceRequest && (
            <Card className="p-3 border-primary bg-primary/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <div>
                    <p className="font-medium text-sm">{selectedMaintenanceRequest.title}</p>
                    {selectedMaintenanceRequest.room_number && (
                      <p className="text-xs text-muted-foreground">
                        {t('rooms:room')} {selectedMaintenanceRequest.room_number}
                      </p>
                    )}
                  </div>
                </div>
                <TouchButton
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSelectedMaintenanceRequest(null)}
                >
                  <X className="h-4 w-4" />
                </TouchButton>
              </div>
            </Card>
          )}
          
          <TouchButton
            variant="outline"
            className="w-full h-14 justify-between"
            onClick={() => setShowMaintenanceSelector(true)}
          >
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-muted-foreground" />
              <span>
                {selectedMaintenanceRequest
                  ? t('inventory:outbound.maintenanceLinked')
                  : t('inventory:outbound.noMaintenanceLink')
                }
              </span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </TouchButton>
          
          {/* Manual Location Input */}
          {!selectedMaintenanceRequest && (
            <div className="space-y-2 pt-4 border-t">
              <Label>{t('inventory:mobileForm.outbound.toLocation')}</Label>
              <Input
                placeholder={t('inventory:mobileForm.outbound.toPlaceholder')}
                value={form.watch('to_location') || ''}
                onChange={(e) => form.setValue('to_location', e.target.value)}
                className="h-12"
              />
            </div>
          )}
        </motion.div>
      )
    }
    
    // Step: Items Selection
    if (stepKey === 'items') {
      return (
        <motion.div
          key="step-items"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className={cn("space-y-4", shake && "animate-shake")}
        >
          {/* Stock Errors */}
          {hasStockError && (
            <div className="px-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('inventory:mobileForm.outbound.stockError')}
                </AlertDescription>
              </Alert>
            </div>
          )}
          
          {/* Low Stock Warnings */}
          {lowStockWarnings.length > 0 && !hasStockError && (
            <div className="px-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('inventory:mobileForm.outbound.lowStockWarning', { count: lowStockWarnings.length })}
                </AlertDescription>
              </Alert>
            </div>
          )}
          
          {/* Empty State */}
          {fields.length === 0 ? (
            <motion.div 
              className="text-center py-12 px-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="w-20 h-20 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
                <Package className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{t('inventory:mobileForm.noItems')}</h3>
              <p className="text-muted-foreground mb-6">
                {t('inventory:mobileForm.outbound.noItemsDescription')}
              </p>
              <TouchButton 
                onClick={() => setShowItemSelector(true)}
                className="h-12 px-6"
              >
                <Plus className="mr-2 h-5 w-5" />
                {t('inventory:mobileForm.addItem')}
              </TouchButton>
            </motion.div>
          ) : (
            <>
              {/* Selected Items */}
              <div className="px-4 space-y-2">
                <h3 className="font-semibold">{t('inventory:mobileForm.selected')} ({fields.length})</h3>
                {fields.map((field, index) => {
                  const item = itemsData?.items.find(i => i.id === field.item_id)
                  const primaryImage = item?.item_images?.[0]?.url
                  const currentQuantity = watchedItems[index]?.quantity || field.quantity
                  const warehouseQty = warehouseStockMap?.[field.item_id]?.quantity || 0
                  const hasError = currentQuantity > warehouseQty
                  const isLowStock = warehouseQty - currentQuantity < 10
                  
                  return (
                    <Card key={field.id} className={cn("p-4", hasError && "border-destructive")}>
                      {/* Header: Image + Name + Remove button */}
                      <div className="flex items-start gap-3 mb-3">
                        {primaryImage ? (
                          <img 
                            src={primaryImage} 
                            alt={item?.name}
                            className="w-14 h-14 rounded-lg object-cover shrink-0" 
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Package className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium leading-tight">{item?.name || t('inventory:mobileForm.itemDefault')}</p>
                          <p className="text-sm text-muted-foreground">{item?.code}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('inventory:mobileForm.stock')}: <span className={hasError ? 'text-destructive font-semibold' : ''}>
                              {warehouseQty} {item?.unit}
                            </span>
                          </p>
                        </div>
                        <TouchButton 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                          onClick={() => handleRemoveItem(index)}
                        >
                          <X className="h-4 w-4" />
                        </TouchButton>
                      </div>
                      
                      {/* Quantity Row with +/- buttons */}
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-sm text-muted-foreground shrink-0">{t('inventory:mobileForm.quantity')}:</Label>
                        <div className="flex items-center gap-2">
                          <TouchButton 
                            variant="outline" 
                            size="icon" 
                            className="h-9 w-9"
                            onClick={() => updateQuantity(index, currentQuantity - 1)}
                            disabled={currentQuantity <= 1}
                          >
                            <Minus className="h-4 w-4" />
                          </TouchButton>
                          <Input
                            type="number"
                            value={currentQuantity}
                            onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                            className={cn(
                              "h-9 w-16 text-center",
                              hasError && "border-destructive"
                            )}
                            min={1}
                            max={warehouseQty}
                          />
                          <TouchButton 
                            variant="outline" 
                            size="icon" 
                            className="h-9 w-9"
                            onClick={() => updateQuantity(index, currentQuantity + 1)}
                            disabled={currentQuantity >= warehouseQty}
                          >
                            <Plus className="h-4 w-4" />
                          </TouchButton>
                        </div>
                      </div>
                      
                      {/* Weight input for laundry */}
                      {category === 'laundry' && (
                        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t">
                          <Label className="text-sm text-muted-foreground shrink-0">{t('laundry:batch.weightKg')}:</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={watchedItems[index]?.weight_kg || 0}
                            onChange={(e) => form.setValue(`items.${index}.weight_kg`, parseFloat(e.target.value) || 0)}
                            className="h-9 w-24 text-center"
                            min={0}
                          />
                        </div>
                      )}
                      
                      {hasError && (
                        <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {t('inventory:mobileForm.outbound.exceededStock')} ({warehouseQty})
                        </p>
                      )}
                      {!hasError && isLowStock && (
                        <p className="text-xs text-amber-600 mt-2">
                          {t('inventory:mobileForm.outbound.remainingAfterExport')}: {warehouseQty - currentQuantity}
                        </p>
                      )}
                    </Card>
                  )
                })}
              </div>
              
              {/* Add More Button */}
              <div className="px-4">
                <TouchButton 
                  variant="outline" 
                  className="w-full h-12"
                  onClick={() => setShowItemSelector(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('inventory:mobileForm.addItem')}
                </TouchButton>
              </div>
              
              {/* Summary */}
              {watchedItems.length > 0 && (
                <div className="px-4">
                  <Card className="p-4 bg-muted/50">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('inventory:mobileForm.outbound.totalExportQuantity')}:</span>
                      <span className="font-medium text-lg">{totalQuantity}</span>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}
        </motion.div>
      )
    }
    
    // Step: Confirm
    if (stepKey === 'confirm') {
      return (
        <motion.div
          key="step-confirm"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="p-4 space-y-6"
        >
          <div>
            <h2 className="text-lg font-semibold mb-4">{t('inventory:mobileForm.outbound.recipientInfo')}</h2>
            
            <div className="space-y-4">
              {(category === 'disposal' || category === 'other' || category === 'maintenance') && (
                <div>
                  <Label htmlFor="recipient_name">{t('inventory:mobileForm.outbound.recipientName')}</Label>
                  <Input 
                    id="recipient_name"
                    placeholder={t('inventory:mobileForm.outbound.recipientPlaceholder')}
                    className="min-h-[48px] mt-2"
                    {...form.register('recipient_name')}
                  />
                </div>
              )}
              
              <div>
                <Label>{t('inventory:mobileForm.uploadPhotos')}</Label>
                <ImageUpload 
                  images={form.watch('photos') || []}
                  onChange={(urls) => form.setValue('photos', urls)}
                  maxImages={10}
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label htmlFor="notes">{t('inventory:mobileForm.notes')}</Label>
                <Textarea 
                  id="notes"
                  placeholder={t('inventory:mobileForm.notesPlaceholder')}
                  rows={4}
                  className="resize-none mt-2"
                  {...form.register('notes')}
                />
              </div>
            </div>
          </div>
          
          {/* Review Summary */}
          <div className="space-y-3 p-4 bg-muted rounded-lg">
            <h3 className="font-semibold">{t('inventory:mobileForm.confirmInfo')}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('inventory:mobileForm.type')}:</span>
                <span className="font-medium">{selectedCategory?.label}</span>
              </div>
              
              {category === 'room_assign' && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('rooms:rooms')}:</span>
                  <span className="font-medium">{selectedRoomIds.length} {t('rooms:rooms')}</span>
                </div>
              )}
              
              {category === 'laundry' && selectedVendor && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('laundry:batch.vendor')}:</span>
                  <span className="font-medium">{selectedVendor.name}</span>
                </div>
              )}
              
              {category === 'maintenance' && selectedMaintenanceRequest && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('maintenance:requests.title')}:</span>
                  <span className="font-medium truncate max-w-[180px]">{selectedMaintenanceRequest.title}</span>
                </div>
              )}
              
              <div className="h-px bg-border my-2" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('inventory:mobileForm.outbound.itemCount')}:</span>
                <span className="font-medium">{watchedItems.length}</span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="font-semibold">{t('inventory:mobileForm.outbound.totalExportQuantity')}:</span>
                <span className="font-bold text-primary">{totalQuantity}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )
    }
    
    return null
  }
  
  return (
    <div className="min-h-screen bg-background pb-40">
      {/* Compact header (no wizard step indicator) */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between px-3 py-2.5">
          <TouchButton variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </TouchButton>
          <h1 className="text-base font-semibold">{t('inventory:mobileForm.outbound.title', { defaultValue: 'Xuất kho' })}</h1>
          <TouchButton variant="ghost" size="sm" onClick={handleSaveDraft} disabled={isLoading}>
            <Save className="h-4 w-4 mr-1" />
            {t('inventory:mobileForm.saveDraft')}
          </TouchButton>
        </div>
      </div>

      {/* Single-page content — render every step block in order */}
      <div className={cn(shake && 'animate-shake')}>
        {steps.map((s) => (
          <div key={s.key}>{renderStepContent(s.key)}</div>
        ))}
      </div>

      {/* Sticky submit (single CTA — Zod + validateStep loop guard everything) */}
      <div className="fixed bottom-16 left-0 right-0 p-3 bg-background border-t z-40">
        <TouchButton
          onClick={handleSubmit}
          className="w-full h-12"
          disabled={!allStepsValid || isLoading}
        >
          {isLoading
            ? t('inventory:mobileForm.processing')
            : t('inventory:mobileForm.complete', { defaultValue: 'Xác nhận xuất kho' })}
        </TouchButton>
      </div>

      
      {/* Room Selector Sheet */}
      <MobileRoomSelectSheet
        open={showRoomSelector}
        onOpenChange={setShowRoomSelector}
        selectedRoomIds={selectedRoomIds}
        onSelect={setSelectedRoomIds}
        multiSelect={true}
      />
      
      {/* Maintenance Selector Sheet */}
      <MobileMaintenanceSelectSheet
        open={showMaintenanceSelector}
        onOpenChange={setShowMaintenanceSelector}
        selectedRequest={selectedMaintenanceRequest}
        onSelect={setSelectedMaintenanceRequest}
      />
      
      {/* Item Selector Sheet */}
      <Sheet open={showItemSelector} onOpenChange={setShowItemSelector}>
        <SheetContent side="bottom" className="h-[80vh]">
          <SheetHeader>
            <SheetTitle>{t('inventory:mobileForm.selectItem')}</SheetTitle>
          </SheetHeader>
          
          <div className="mt-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={t('inventory:mobileForm.searchItems')}
                className="pl-10 min-h-[48px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {isLoadingItems ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">{t('inventory:mobileForm.outbound.loading')}</p>
                </div>
              ) : itemsData?.items.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">{t('inventory:mobileForm.noItemsFound')}</p>
                </div>
              ) : (
                itemsData?.items.map((item) => {
                  const availableQty = item.quantity_in_stock || 0
                  const primaryImage = item.item_images?.[0]?.url
                  const isAlreadyAdded = watchedItems.some(i => i.item_id === item.id)
                  
                  return (
                    <Card 
                      key={item.id}
                      className={cn(
                        "p-3 cursor-pointer hover:bg-muted/50",
                        isAlreadyAdded && "opacity-50",
                        availableQty === 0 && "opacity-50"
                      )}
                      onClick={() => {
                        if (!isAlreadyAdded && availableQty > 0) {
                          addItem(item.id, availableQty)
                        }
                      }}
                    >
                      <div className="flex gap-3">
                        {primaryImage ? (
                          <img 
                            src={primaryImage} 
                            alt={item.name}
                            className="w-12 h-12 rounded object-cover" 
                          />
                        ) : (
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{item.name}</p>
                            {isAlreadyAdded && (
                              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                                {t('inventory:mobileForm.outbound.alreadyAdded')}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{item.code}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('inventory:mobileForm.outbound.inStock')}: <span className={availableQty === 0 ? 'text-destructive' : ''}>
                              {availableQty} {item.unit}
                            </span>
                          </p>
                        </div>
                      </div>
                    </Card>
                  )
                })
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      
      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('inventory:mobileForm.outbound.exitTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('inventory:mobileForm.outbound.exitDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <TouchButton variant="outline" onClick={() => setShowExitDialog(false)} className="w-full sm:w-auto">
              {t('inventory:mobileForm.outbound.continueEditing')}
            </TouchButton>
            <TouchButton variant="secondary" onClick={handleSaveDraft} className="w-full sm:w-auto">
              <Save className="h-4 w-4 mr-2" />
              {t('inventory:mobileForm.saveDraft')}
            </TouchButton>
            <TouchButton variant="destructive" onClick={handleDiscard} className="w-full sm:w-auto">
              {t('inventory:mobileForm.outbound.discard')}
            </TouchButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
