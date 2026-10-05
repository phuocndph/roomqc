import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Plus, Trash2, Check, Package } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { navigateBack } from '@/lib/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/shared/DatePicker'
import { useCreateLaundryBatch } from '@/hooks/useLaundryBatches'
import { useLaundryVendors } from '@/hooks/useLaundryVendors'
import { useItems } from '@/hooks/useItems'
import { useUsers } from '@/hooks/useUsers'
import { useUser } from '@/hooks/useUser'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { addDays, format } from 'date-fns'

type Step1Data = {
  vendor_id: string
  delivery_date: string
  expected_return_date?: string
  delivery_staff_id: string
  receiver_name: string
  notes?: string
}

type Step2Data = {
  items: {
    item_id: string
    quantity: number
    weight_kg: number
    condition_note?: string
  }[]
}

interface BatchItem {
  item_id: string
  item: any
  quantity: number
  weight_kg: number
  condition_note?: string
}

export function MobileBatchForm() {
  const navigate = useNavigate()
  const { t } = useTranslation('laundry')
  const [step, setStep] = useState(1)
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null)
  const [items, setItems] = useState<BatchItem[]>([])
  const [showItemSheet, setShowItemSheet] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  const { data: vendors } = useLaundryVendors({ status: 'active' })
  const { data: itemsData } = useItems({})
  const { users } = useUsers()
  const { tenantId } = useUser()
  const { mutate: createBatch, isPending } = useCreateLaundryBatch()
  
  // Fetch launderable categories - same logic as Desktop (CreateBatchStep2)
  const { data: launderableCategories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ['launderable-categories', tenantId],
    queryFn: async () => {
      if (!tenantId) return []
      const { data, error } = await supabase
        .from('item_categories')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_launderable', true)
        .eq('status', 'active')
      if (error) throw error
      return data?.map(cat => cat.id) || []
    },
    enabled: !!tenantId,
  })
  
  // Dynamic schema with translations
  const step1Schema = useMemo(() => z.object({
    vendor_id: z.string().uuid(t('createBatch.validation.selectVendor')),
    delivery_date: z.string(),
    expected_return_date: z.string().optional(),
    delivery_staff_id: z.string().uuid(t('createBatch.validation.selectDeliveryStaff')),
    receiver_name: z.string().min(2, t('createBatch.validation.enterReceiverName')),
    notes: z.string().optional(),
  }), [t])
  
  // Filter launderable items with is_launderable check and stock availability
  const laundrableItems = itemsData?.items?.filter(item => {
    const hasStock = (item.quantity_in_stock || 0) > 0
    const isLaunderable = item.category_id && launderableCategories?.includes(item.category_id)
    return hasStock && isLaunderable
  })
  
  const step1Form = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      vendor_id: '',
      delivery_date: new Date().toISOString().split('T')[0],
      expected_return_date: addDays(new Date(), 2).toISOString().split('T')[0],
      delivery_staff_id: '',
      receiver_name: '',
      notes: '',
    },
  })
  
  const vendorId = step1Form.watch('vendor_id')
  const selectedVendor = vendors?.find(v => v.id === vendorId)
  
  const addItem = (item: any) => {
    const existing = items.find(i => i.item_id === item.id)
    const currentQty = existing?.quantity || 0
    const stockAvailable = item.quantity_in_stock || 0
    
    // Check stock before adding
    if (currentQty + 1 > stockAvailable) {
      toast.error(t('mobileBatch.insufficientStock', { 
        name: item.name, 
        stock: stockAvailable 
      }))
      return
    }
    
    if (existing) {
      setItems(items.map(i => 
        i.item_id === item.id 
          ? { ...i, quantity: i.quantity + 1 } 
          : i
      ))
    } else {
      setItems([...items, {
        item_id: item.id,
        item: item,
        quantity: 1,
        weight_kg: 0,
        condition_note: '',
      }])
    }
    toast.success(t('mobileBatch.itemAdded', { name: item.name }))
  }
  
  const removeItem = (itemId: string) => {
    setItems(items.filter(i => i.item_id !== itemId))
    toast.success(t('mobileBatch.itemRemoved'))
  }
  
  const updateItem = (itemId: string, field: keyof BatchItem, value: any) => {
    // Validate quantity against stock when updating
    if (field === 'quantity') {
      const batchItem = items.find(i => i.item_id === itemId)
      const stockAvailable = batchItem?.item?.quantity_in_stock || 0
      if (value > stockAvailable) {
        toast.error(t('mobileBatch.maxStock', { max: stockAvailable }))
        return
      }
      if (value < 1) {
        return // Don't allow quantity less than 1
      }
    }
    
    setItems(items.map(i => 
      i.item_id === itemId ? { ...i, [field]: value } : i
    ))
  }
  
  const handleStep1Complete = () => {
    step1Form.handleSubmit((data) => {
      setStep1Data(data)
      setStep(2)
    })()
  }
  
  const handleStep2Complete = () => {
    if (items.length === 0) {
      toast.error(t('createBatch.validation.addAtLeastOneItem'))
      return
    }
    setStep(3)
  }
  
  const handleSubmit = () => {
    if (!step1Data) return
    
    // Convert dates from string to Date
    const batchData = {
      step1: {
        ...step1Data,
        delivery_date: new Date(step1Data.delivery_date),
        expected_return_date: step1Data.expected_return_date ? new Date(step1Data.expected_return_date) : new Date(),
      } as any,
      step2: { items: items.map(i => ({
        item_id: i.item_id,
        quantity: i.quantity,
        weight_kg: i.weight_kg,
        condition_note: i.condition_note,
      }))},
      step3: {
        confirmed: true,
      },
    }
    
    createBatch(batchData, {
      onSuccess: () => {
        navigate('/laundry')
      },
    })
  }
  
  const filteredItems = laundrableItems?.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code.toLowerCase().includes(searchTerm.toLowerCase())
  )
  
  const steps = [
    { number: 1, title: t('createBatch.steps.basicInfo') },
    { number: 2, title: t('createBatch.steps.selectItems') },
    { number: 3, title: t('createBatch.steps.confirm') },
  ]
  
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Mobile Header */}
      <div className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateBack(navigate, '/laundry')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold">{t('createBatch.title')}</h1>
            <p className="text-xs text-muted-foreground">{t('mobileBatch.stepOf', { step, total: 3 })}</p>
          </div>
          {step === 2 && (
            <Badge variant="secondary">
              <Package className="h-3 w-3 mr-1" />
              {items.length}
            </Badge>
          )}
        </div>
        
        {/* Progress */}
        <Progress value={(step / 3) * 100} className="h-1" />
      </div>
      
      {/* Step Indicator */}
      <div className="flex justify-between px-4 py-4 bg-muted/30">
        {steps.map((s) => (
          <div
            key={s.number}
            className="flex flex-col items-center gap-1 flex-1"
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                step >= s.number
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {step > s.number ? <Check className="h-4 w-4" /> : s.number}
            </div>
            <span className="text-xs text-center">{s.title}</span>
          </div>
        ))}
      </div>
      
      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Step 1: Basic Info */}
        {step === 1 && (
          <>
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>{t('createBatch.step1.vendor')} *</Label>
                  <Select
                    value={step1Form.watch('vendor_id')}
                    onValueChange={(value) => step1Form.setValue('vendor_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('mobileBatch.selectVendor')} />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors?.map(vendor => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {step1Form.formState.errors.vendor_id && (
                    <p className="text-sm text-destructive">
                      {step1Form.formState.errors.vendor_id.message}
                    </p>
                  )}
                </div>
                
                {selectedVendor && (
                  <div className="p-3 bg-muted rounded-lg space-y-1">
                    <p className="text-sm font-medium">{selectedVendor.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedVendor.contact_person}</p>
                    <p className="text-xs text-muted-foreground">{selectedVendor.phone}</p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label>{t('createBatch.step1.deliveryDate')}</Label>
                  <Input
                    type="date"
                    {...step1Form.register('delivery_date')}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>{t('createBatch.step1.expectedReturn')}</Label>
                  <Input
                    type="date"
                    {...step1Form.register('expected_return_date')}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>{t('createBatch.step1.deliveryStaff')} *</Label>
                  <Select
                    value={step1Form.watch('delivery_staff_id')}
                    onValueChange={(value) => step1Form.setValue('delivery_staff_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('createBatch.step1.selectStaff')} />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {step1Form.formState.errors.delivery_staff_id && (
                    <p className="text-sm text-destructive">
                      {step1Form.formState.errors.delivery_staff_id.message}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label>{t('createBatch.step1.receiverName')} *</Label>
                  <Input
                    {...step1Form.register('receiver_name')}
                    placeholder={t('createBatch.step1.receiverPlaceholder')}
                  />
                  {step1Form.formState.errors.receiver_name && (
                    <p className="text-sm text-destructive">
                      {step1Form.formState.errors.receiver_name.message}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label>{t('createBatch.step1.notes')}</Label>
                  <Textarea
                    {...step1Form.register('notes')}
                    placeholder={t('createBatch.step1.notesPlaceholder')}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
            
            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={handleStep1Complete}
            >
              {t('createBatch.step1.next')}
            </Button>
          </>
        )}
        
        {/* Step 2: Items */}
        {step === 2 && (
          <>
            <Card>
              <CardContent className="pt-4 space-y-3">
                {items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>{t('mobileBatch.noItemsYet')}</p>
                  </div>
                ) : (
                  items.map((item) => (
                    <div key={item.item_id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.item.code}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeItem(item.item_id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">{t('createBatch.step2.quantity')}</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.item_id, 'quantity', Number(e.target.value))}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">{t('createBatch.step2.weight')}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={item.weight_kg}
                            onChange={(e) => updateItem(item.item_id, 'weight_kg', Number(e.target.value))}
                            className="h-9"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-xs">{t('mobileBatch.condition')}</Label>
                        <Input
                          value={item.condition_note || ''}
                          onChange={(e) => updateItem(item.item_id, 'condition_note', e.target.value)}
                          placeholder={t('createBatch.step2.conditionPlaceholder')}
                          className="h-9"
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowItemSheet(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('mobileBatch.addLaundryItem')}
            </Button>
            
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                {t('createBatch.step2.back')}
              </Button>
              <Button type="button" className="flex-1" onClick={handleStep2Complete}>
                {t('createBatch.step2.next')}
              </Button>
            </div>
          </>
        )}
        
        {/* Step 3: Confirm */}
        {step === 3 && (
          <>
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">{t('createBatch.step3.vendor')}</Label>
                  <p className="font-medium">{selectedVendor?.name}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('createBatch.step3.deliveryDate')}</Label>
                    <p className="text-sm">{step1Data?.delivery_date ? format(new Date(step1Data.delivery_date), 'dd/MM/yyyy') : '-'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('mobileBatch.returnDate')}</Label>
                    <p className="text-sm">{step1Data?.expected_return_date ? format(new Date(step1Data.expected_return_date), 'dd/MM/yyyy') : '-'}</p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">{t('mobileBatch.totalLaundry')}</Label>
                  <p className="text-sm">{items.length} {t('mobileBatch.types')} ({items.reduce((sum, item) => sum + item.quantity, 0)} {t('mobileBatch.products')})</p>
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">{t('createBatch.step3.totalWeight')}</Label>
                  <p className="text-sm">{items.reduce((sum, item) => sum + item.weight_kg, 0).toFixed(1)} {t('units.kg')}</p>
                </div>
              </CardContent>
            </Card>
            
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
                {t('createBatch.step3.back')}
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? t('createBatch.step3.creating') : t('createBatch.step3.create')}
              </Button>
            </div>
          </>
        )}
      </div>
      
      {/* Item Selection Sheet */}
      <Sheet open={showItemSheet} onOpenChange={setShowItemSheet}>
        <SheetContent side="bottom" className="h-[85vh]">
          <SheetHeader>
            <SheetTitle>{t('mobileBatch.selectLaundryItem')}</SheetTitle>
          </SheetHeader>
          
          <div className="mt-4 space-y-4">
            <Input
              placeholder={t('mobileBatch.searchItems')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {isLoadingCategories ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>{t('common:loading', 'Đang tải...')}</p>
                </div>
              ) : !filteredItems || filteredItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t('createBatch.step2.noLaunderableItems', 'Không có đồ vải có thể giặt trong kho')}</p>
                  <p className="text-xs mt-2">{t('mobileBatch.checkCategorySettings', 'Kiểm tra cài đặt danh mục hoặc tồn kho')}</p>
                </div>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                    onClick={() => addItem(item)}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.code}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('mobileBatch.stock')}: {item.quantity_in_stock || 0} {item.unit}
                      </p>
                    </div>
                    <Button size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
