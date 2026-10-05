import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Plus, Trash2, ShoppingCart, Package, Check } from 'lucide-react'
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
import { useVendors } from '@/hooks/useVendors'
import { useItems } from '@/hooks/useItems'
import { useCreatePO } from '@/hooks/usePurchaseOrders'
import { useHotelContext } from '@/contexts/HotelContext'
import { DatePicker } from '@/components/shared/DatePicker'
import { toast } from 'sonner'
import { addDays, format } from 'date-fns'
import { formatCurrency } from '@/lib/utils'

const poSchema = z.object({
  vendor_id: z.string().uuid('validation.vendorRequired'),
  order_date: z.string(),
  expected_delivery_date: z.string(),
  shipping_address: z.string().min(10, 'validation.addressMin'),
  items: z.array(z.object({
    item_id: z.string().uuid(),
    quantity: z.number().positive(),
    unit_price: z.number().nonnegative(),
    notes: z.string().optional()
  })).min(1, 'validation.itemsMin'),
  tax_rate: z.number().min(0).max(100),
  shipping_fee: z.number().nonnegative(),
  notes: z.string().optional()
})

type POFormData = z.infer<typeof poSchema>

interface CartItem {
  item_id: string
  item: any
  quantity: number
  unit_price: number
  notes?: string
}

export function MobilePOForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedVendorId = searchParams.get('vendor')
  const { selectedHotel } = useHotelContext()
  const { t } = useTranslation('purchaseOrders')
  const { t: tCommon } = useTranslation('common')
  
  const [step, setStep] = useState(1)
  const [cart, setCart] = useState<CartItem[]>([])
  const [showItemSheet, setShowItemSheet] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  const { data: vendors } = useVendors({ status: 'active' })
  const { data: itemsData } = useItems({})
  const createPO = useCreatePO()
  
  const form = useForm<POFormData>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      vendor_id: preselectedVendorId || '',
      order_date: new Date().toISOString().split('T')[0],
      expected_delivery_date: addDays(new Date(), 7).toISOString().split('T')[0],
      shipping_address: selectedHotel?.address || '',
      items: [],
      tax_rate: 10,
      shipping_fee: 0,
      notes: ''
    }
  })
  
  const vendorId = form.watch('vendor_id')
  const selectedVendor = vendors?.find(v => v.id === vendorId)
  
  // Update items in form when cart changes
  useEffect(() => {
    form.setValue('items', cart.map(c => ({
      item_id: c.item_id,
      quantity: c.quantity,
      unit_price: c.unit_price,
      notes: c.notes
    })))
  }, [cart, form])
  
  const addToCart = (item: any) => {
    const existing = cart.find(c => c.item_id === item.id)
    if (existing) {
      setCart(cart.map(c => 
        c.item_id === item.id 
          ? { ...c, quantity: c.quantity + 1 } 
          : c
      ))
    } else {
      setCart([...cart, {
        item_id: item.id,
        item: item,
        quantity: 1,
        unit_price: item.unit_price || 0,
        notes: ''
      }])
    }
    toast.success(t('cart.addedToCart', { name: item.name }))
  }
  
  const removeFromCart = (itemId: string) => {
    setCart(cart.filter(c => c.item_id !== itemId))
    toast.success(t('cart.removedFromCart'))
  }
  
  const updateCartItem = (itemId: string, field: 'quantity' | 'unit_price', value: number) => {
    setCart(cart.map(c => 
      c.item_id === itemId ? { ...c, [field]: value } : c
    ))
  }
  
  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  }
  
  const calculateTotal = () => {
    const subtotal = calculateSubtotal()
    const tax = subtotal * (form.watch('tax_rate') / 100)
    const shipping = form.watch('shipping_fee')
    return subtotal + tax + shipping
  }
  
  const onSubmit = async (data: POFormData) => {
    if (!selectedHotel?.id) {
      toast.error(t('messages.selectHotelRequired'))
      return
    }
    
    try {
      await createPO.mutateAsync(data as any)
      navigate('/purchase-orders')
    } catch (error) {
      toast.error(t('messages.createError'))
    }
  }
  
  const filteredItems = itemsData?.items?.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code.toLowerCase().includes(searchTerm.toLowerCase())
  )
  
  const steps = [
    { number: 1, title: t('form.steps.vendor') },
    { number: 2, title: t('form.steps.products') },
    { number: 3, title: t('form.steps.confirm') }
  ]
  
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Mobile Header */}
      <div className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateBack(navigate, '/purchase-orders')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold">{t('form.create')}</h1>
            <p className="text-xs text-muted-foreground">{t('form.step', { current: step, total: 3 })}</p>
          </div>
          <Badge variant="secondary">
            <ShoppingCart className="h-3 w-3 mr-1" />
            {cart.length}
          </Badge>
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
        {/* Step 1: Vendor & Dates */}
        {step === 1 && (
          <>
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>{t('fields.vendor')} *</Label>
                  <Select
                    value={form.watch('vendor_id')}
                    onValueChange={(value) => form.setValue('vendor_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('placeholders.selectVendor')} />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors?.map(vendor => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.vendor_id && (
                    <p className="text-sm text-destructive">
                      {t(form.formState.errors.vendor_id.message as string)}
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
                  <Label>{t('fields.orderDate')}</Label>
                  <Input
                    type="date"
                    {...form.register('order_date')}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>{t('fields.deliveryDate')}</Label>
                  <Input
                    type="date"
                    {...form.register('expected_delivery_date')}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>{t('fields.shippingAddress')} *</Label>
                  <Textarea
                    {...form.register('shipping_address')}
                    placeholder={t('placeholders.enterShippingAddress')}
                    rows={3}
                  />
                  {form.formState.errors.shipping_address && (
                    <p className="text-sm text-destructive">
                      {t(form.formState.errors.shipping_address.message as string)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={() => {
                if (!form.watch('vendor_id')) {
                  toast.error(t('messages.selectVendorRequired'))
                  return
                }
                setStep(2)
              }}
            >
              {t('actions.next')}
            </Button>
          </>
        )}
        
        {/* Step 2: Items */}
        {step === 2 && (
          <>
            {/* Cart Items */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>{t('cart.empty')}</p>
                  </div>
                ) : (
                  cart.map((item) => (
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
                          onClick={() => removeFromCart(item.item_id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">{t('cart.quantity')}</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateCartItem(item.item_id, 'quantity', Number(e.target.value))}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">{t('cart.unitPrice')}</Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => updateCartItem(item.item_id, 'unit_price', Number(e.target.value))}
                            className="h-9"
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t('cart.subtotal')}:</span>
                        <span className="font-medium">
                          {formatCurrency(item.quantity * item.unit_price)}
                        </span>
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
              {t('cart.addProduct')}
            </Button>
            
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                {t('actions.back')}
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => {
                  if (cart.length === 0) {
                    toast.error(t('messages.selectProductsRequired'))
                    return
                  }
                  setStep(3)
                }}
              >
                {t('actions.next')}
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
                  <Label className="text-xs text-muted-foreground">{t('fields.vendor')}</Label>
                  <p className="font-medium">{selectedVendor?.name}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('fields.orderDate')}</Label>
                    <p className="text-sm">{format(new Date(form.watch('order_date')), 'dd/MM/yyyy')}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('fields.deliveryDate')}</Label>
                    <p className="text-sm">{format(new Date(form.watch('expected_delivery_date')), 'dd/MM/yyyy')}</p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">{t('fields.totalProducts')}</Label>
                  <p className="text-sm">{cart.length} {tCommon('types')} ({cart.reduce((sum, item) => sum + item.quantity, 0)} {tCommon('products')})</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="space-y-2">
                  <Label>{t('fields.taxRate')}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    {...form.register('tax_rate', { valueAsNumber: true })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>{t('fields.shippingFee')}</Label>
                  <Input
                    type="number"
                    min="0"
                    {...form.register('shipping_fee', { valueAsNumber: true })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>{t('fields.notes')}</Label>
                  <Textarea
                    {...form.register('notes')}
                    placeholder={t('placeholders.additionalNotes')}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
            
            {/* Summary */}
            <Card>
              <CardContent className="pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t('summary.subtotal')}:</span>
                  <span>{formatCurrency(calculateSubtotal())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('summary.tax', { rate: form.watch('tax_rate') })}:</span>
                  <span>{formatCurrency(calculateSubtotal() * (form.watch('tax_rate') / 100))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('summary.shipping')}:</span>
                  <span>{formatCurrency(form.watch('shipping_fee'))}</span>
                </div>
                <div className="h-px bg-border my-2" />
                <div className="flex justify-between font-medium text-base">
                  <span>{t('summary.total')}:</span>
                  <span className="text-primary">{formatCurrency(calculateTotal())}</span>
                </div>
              </CardContent>
            </Card>
            
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
                {t('actions.back')}
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={form.handleSubmit(onSubmit)}
                disabled={createPO.isPending}
              >
                {createPO.isPending ? tCommon('loading') : t('actions.create')}
              </Button>
            </div>
          </>
        )}
      </div>
      
      {/* Item Selection Sheet */}
      <Sheet open={showItemSheet} onOpenChange={setShowItemSheet}>
        <SheetContent side="bottom" className="h-[85vh]">
          <SheetHeader>
            <SheetTitle>{t('form.steps.selectProducts')}</SheetTitle>
          </SheetHeader>
          
          <div className="mt-4 space-y-4">
            <Input
              placeholder={t('form.searchProducts')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {filteredItems?.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                  onClick={() => addToCart(item)}
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.code}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatCurrency(item.unit_price || 0)} / {item.unit}
                    </p>
                  </div>
                  <Button size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
