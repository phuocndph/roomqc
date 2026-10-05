import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { navigateBack } from '@/lib/navigation';
import { useTranslation } from 'react-i18next';
import { useVendors } from '@/hooks/useVendors';
import { useItems } from '@/hooks/useItems';
import { useCreatePO } from '@/hooks/usePurchaseOrders';
import { useUser } from '@/hooks/useUser';
import { useHotelContext } from '@/contexts/HotelContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/shared/DatePicker';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Building,
  Package,
  Plus,
  Trash2,
  Search,
  ShoppingCart,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { addDays, format } from 'date-fns';

const poItemSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.number().positive('Số lượng phải lớn hơn 0'),
  unit_price: z.number().nonnegative('Đơn giá không được âm'),
  notes: z.string().optional()
});

const poSchema = z.object({
  vendor_id: z.string().uuid('Vui lòng chọn nhà cung cấp'),
  order_date: z.string(),
  expected_delivery_date: z.string(),
  shipping_address: z.string().min(10, 'Địa chỉ phải có ít nhất 10 ký tự'),
  items: z.array(poItemSchema).min(1, 'Phải có ít nhất 1 sản phẩm'),
  tax_rate: z.number().min(0).max(100),
  shipping_fee: z.number().nonnegative(),
  notes: z.string().optional()
}).refine(
  data => new Date(data.expected_delivery_date) > new Date(data.order_date),
  {
    message: 'Ngày giao phải sau ngày đặt',
    path: ['expected_delivery_date']
  }
);

type POFormData = z.infer<typeof poSchema>;

interface CartItem {
  item_id: string;
  item: any;
  quantity: number;
  unit_price: number;
  notes?: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(amount);
};

const formatDate = (date: string) => {
  return format(new Date(date), 'dd/MM/yyyy');
};

const POForm: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedVendorId = searchParams.get('vendor');
  const { user, tenantId } = useUser();
  const { selectedHotel, isAllHotelsMode } = useHotelContext();
  const { t } = useTranslation('purchaseOrders');
  const { t: tCommon } = useTranslation('common');

  const [step, setStep] = useState(1);
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const { data: vendors } = useVendors({ status: 'active' });
  const { data: items } = useItems({});
  const createPO = useCreatePO();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<POFormData>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      vendor_id: preselectedVendorId || '',
      order_date: new Date().toISOString().split('T')[0],
      expected_delivery_date: addDays(new Date(), 7).toISOString().split('T')[0],
      tax_rate: 10,
      shipping_fee: 0,
      items: []
    }
  });

  const watchedVendorId = watch('vendor_id');
  const watchedTaxRate = watch('tax_rate');
  const watchedShippingFee = watch('shipping_fee');

  useEffect(() => {
    if (watchedVendorId) {
      const vendor = vendors?.find(v => v.id === watchedVendorId);
      setSelectedVendor(vendor);
      
      if (vendor?.delivery_time) {
        const days = parseInt(vendor.delivery_time.match(/\d+/)?.[0] || '7');
        setValue(
          'expected_delivery_date',
          addDays(new Date(), days).toISOString().split('T')[0]
        );
      }
    }
  }, [watchedVendorId, vendors, setValue]);

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxAmount = subtotal * (watchedTaxRate / 100);
  const total = subtotal + taxAmount + watchedShippingFee;

  const handleAddToCart = (item: any) => {
    const existing = cart.find(c => c.item_id === item.id);
    if (existing) {
      setCart(cart.map(c =>
        c.item_id === item.id
          ? { ...c, quantity: c.quantity + 1 }
          : c
      ));
    } else {
      setCart([...cart, {
        item_id: item.id,
        item,
        quantity: 1,
        unit_price: item.unit_price || 0,
        notes: ''
      }]);
    }
    toast.success(t('cart.addedToCart', { name: item.name }));
  };

  const handleRemoveFromCart = (itemId: string) => {
    setCart(cart.filter(c => c.item_id !== itemId));
  };

  const handleUpdateCartItem = (itemId: string, field: string, value: any) => {
    setCart(cart.map(c =>
      c.item_id === itemId ? { ...c, [field]: value } : c
    ));
  };

  const filteredItems = items?.items?.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const onSubmit = async (data: POFormData) => {
    if (cart.length === 0) {
      toast.error(t('messages.selectProductsRequired'));
      return;
    }

    // Prevent creation when in All Hotels mode
    if (isAllHotelsMode) {
      toast.error(t('messages.allHotelsMode'));
      return;
    }

    // Check if hotel is selected
    if (!selectedHotel?.id) {
      toast.error(t('messages.selectHotelRequired'));
      return;
    }

    if (!tenantId) {
      toast.error(tCommon('errors.missingTenant'));
      return;
    }

    try {
      const poData = {
        ...data,
        tenant_id: tenantId,
        hotel_id: selectedHotel.id,
        items: cart.map(item => ({
          item_id: item.item_id,
          quantity_ordered: item.quantity,
          unit_price: item.unit_price,
          notes: item.notes
        })),
        subtotal,
        tax_amount: taxAmount,
        total_amount: total,
        requested_by: user?.id
      };

      const result = await createPO.mutateAsync(poData as any);
      toast.success(t('messages.createSuccess'));
      navigate(`/purchase-orders/${result.id}`);
    } catch (error) {
      toast.error(t('messages.createError'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('form.create')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('form.step', { current: step, total: 4 })}: {
              step === 1 ? t('form.steps.selectVendor') :
              step === 2 ? t('form.steps.selectProducts') :
              step === 3 ? t('form.steps.orderDetails') :
              t('form.steps.reviewSubmit')
            }
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-4">
        {[1, 2, 3, 4].map(s => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-2 ${s <= step ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center font-semibold
                ${s < step ? 'bg-primary text-primary-foreground' : 
                  s === step ? 'bg-primary text-primary-foreground' : 
                  'bg-muted'}
              `}>
                {s < step ? '✓' : s}
              </div>
              <span className="text-sm font-medium">
                {s === 1 ? t('form.steps.vendor') : s === 2 ? t('form.steps.products') : s === 3 ? t('form.steps.details') : t('form.steps.confirm')}
              </span>
            </div>
            {s < 4 && <div className="flex-1 h-0.5 bg-muted" />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Select Vendor */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              {t('form.steps.selectVendor')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('fields.vendor')} *</Label>
              <Select
                value={watchedVendorId}
                onValueChange={(value) => setValue('vendor_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('placeholders.selectVendor')} />
                </SelectTrigger>
                <SelectContent>
                  {vendors?.map(vendor => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      <div className="flex items-center gap-2">
                        <span>{vendor.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {vendor.code}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          ⭐ {vendor.rating.toFixed(1)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.vendor_id && (
                <p className="text-sm text-red-500">{errors.vendor_id.message}</p>
              )}
            </div>

            {selectedVendor && (
              <div className="p-4 border rounded-lg bg-muted/50">
                <h3 className="font-semibold mb-3">{t('form.vendorInfo')}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('form.address')}:</span>
                    <p className="font-medium">{selectedVendor.address}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('form.contact')}:</span>
                    <p className="font-medium">{selectedVendor.phone}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('form.payment')}:</span>
                    <p className="font-medium">{selectedVendor.payment_terms}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('form.delivery')}:</span>
                    <p className="font-medium">{selectedVendor.delivery_time || 'N/A'}</p>
                  </div>
                  {selectedVendor.minimum_order_value && (
                    <div>
                      <span className="text-muted-foreground">{t('form.minOrder')}:</span>
                      <p className="font-medium">
                        {formatCurrency(selectedVendor.minimum_order_value)}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">{t('form.rating')}:</span>
                    <p className="font-medium">
                      ⭐ {selectedVendor.rating.toFixed(1)}/5.0
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigateBack(navigate, '/purchase-orders')}>
                {t('actions.cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={!watchedVendorId}
              >
                {t('actions.next')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Select Items */}
      {step === 2 && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {t('form.steps.selectProducts')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="catalog">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="catalog">{t('form.fromCatalog')}</TabsTrigger>
                    <TabsTrigger value="history">{t('form.fromHistory')}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="catalog" className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder={t('form.searchProducts')}
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div className="border rounded-lg">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('form.product')}</TableHead>
                              <TableHead>{t('form.code')}</TableHead>
                              <TableHead>{t('form.stock')}</TableHead>
                              <TableHead>{t('form.unit')}</TableHead>
                              <TableHead className="text-right">{t('form.lastPrice')}</TableHead>
                              <TableHead className="w-24"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredItems?.map(item => (
                              <TableRow key={item.id}>
                                <TableCell>
                                  <div className="font-medium">{item.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {item.description}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className="font-mono text-sm">{item.code}</span>
                                </TableCell>
                                <TableCell>
                                  <span className={
                                    item.quantity_in_stock < item.minimum_stock
                                      ? 'text-red-600 font-medium'
                                      : ''
                                  }>
                                    {item.quantity_in_stock}
                                  </span>
                                </TableCell>
                                <TableCell>{item.unit}</TableCell>
                                <TableCell className="text-right">
                                  {item.unit_price ? formatCurrency(item.unit_price) : '-'}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAddToCart(item)}
                                    disabled={cart.some(c => c.item_id === item.id)}
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="history">
                    <div className="text-center py-12 text-muted-foreground">
                      {t('form.featureInDevelopment')}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-12 lg:col-span-4">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  {t('cart.title')} ({cart.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {t('cart.empty')}
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {cart.map(item => (
                        <div key={item.item_id} className="p-3 border rounded-lg space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{item.item.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {item.item.code}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveFromCart(item.item_id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">{t('cart.quantity')}</Label>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  handleUpdateCartItem(
                                    item.item_id,
                                    'quantity',
                                    parseInt(e.target.value) || 1
                                  )
                                }
                                className="h-8"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">{t('cart.unitPrice')}</Label>
                              <Input
                                type="number"
                                min="0"
                                value={item.unit_price}
                                onChange={(e) =>
                                  handleUpdateCartItem(
                                    item.item_id,
                                    'unit_price',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="h-8"
                              />
                            </div>
                          </div>

                          <div className="text-sm font-semibold text-right">
                            {formatCurrency(item.quantity * item.unit_price)}
                          </div>
                        </div>
                      ))}
                    </div>

                    <Separator />

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('summary.subtotal')}:</span>
                        <span className="font-medium">{formatCurrency(subtotal)}</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(1)}
                  >
                    {t('actions.back')}
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => setStep(3)}
                    disabled={cart.length === 0}
                  >
                    {t('actions.next')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Step 3: Order Details */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {t('form.steps.orderDetails')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>{t('form.orderDate')} *</Label>
                <DatePicker
                  value={watch('order_date')}
                  onChange={(date) => setValue('order_date', date)}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('form.expectedDeliveryDate')} *</Label>
                <DatePicker
                  value={watch('expected_delivery_date')}
                  onChange={(date) => setValue('expected_delivery_date', date)}
                />
                {errors.expected_delivery_date && (
                  <p className="text-sm text-red-500">
                    {errors.expected_delivery_date.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('form.shippingAddress')} *</Label>
              <Textarea
                placeholder={t('form.shippingAddressPlaceholder')}
                rows={3}
                {...register('shipping_address')}
              />
              {errors.shipping_address && (
                <p className="text-sm text-red-500">{errors.shipping_address.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t('form.vendorNotes')}</Label>
              <Textarea
                placeholder={t('form.vendorNotesPlaceholder')}
                rows={3}
                {...register('notes')}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>{t('form.taxRate')}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  {...register('tax_rate', { valueAsNumber: true })}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('form.shippingFee')}</Label>
                <Input
                  type="number"
                  min="0"
                  {...register('shipping_fee', { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-muted/50">
              <h3 className="font-semibold mb-3">{t('form.orderOverview')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('summary.subtotal')}:</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('summary.tax', { rate: watchedTaxRate })}:
                  </span>
                  <span className="font-medium">{formatCurrency(taxAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('summary.shippingFee')}:</span>
                  <span className="font-medium">{formatCurrency(watchedShippingFee)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>{t('summary.grandTotal')}:</span>
                  <span className="text-primary">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                {t('actions.back')}
              </Button>
              <Button type="button" onClick={() => setStep(4)}>
                {t('actions.next')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review & Submit */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('form.reviewAndSubmit')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">{t('form.vendorLabel')}</h3>
              <div className="p-4 border rounded-lg">
                <div className="font-medium">{selectedVendor?.name}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {selectedVendor?.address}
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">{t('form.productsCount', { count: cart.length })}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('table.product')}</TableHead>
                      <TableHead className="text-right">{t('table.qty')}</TableHead>
                      <TableHead className="text-right">{t('table.unitPrice')}</TableHead>
                      <TableHead className="text-right">{t('table.amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map(item => (
                      <TableRow key={item.item_id}>
                        <TableCell>{item.item.name}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.unit_price)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(item.quantity * item.unit_price)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">{t('form.deliveryInfo')}</h3>
              <div className="p-4 border rounded-lg space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('form.address')}:</span>
                  <p className="font-medium">{watch('shipping_address')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('form.expectedDelivery')}:</span>
                  <span className="font-medium ml-2">
                    {formatDate(watch('expected_delivery_date'))}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-primary/5">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('summary.subtotal')}:</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('summary.tax', { rate: watchedTaxRate })}:</span>
                  <span className="font-medium">{formatCurrency(taxAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('summary.shippingFee')}:</span>
                  <span className="font-medium">{formatCurrency(watchedShippingFee)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-xl font-bold">
                  <span>{t('summary.grandTotal')}:</span>
                  <span className="text-primary">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="confirm" required />
              <Label htmlFor="confirm" className="cursor-pointer">
                {t('form.confirmCheckbox')}
              </Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(3)}>
                {t('actions.back')}
              </Button>
              <Button type="submit" disabled={createPO.isPending}>
                {createPO.isPending ? t('form.creating') : t('form.saveAndSubmit')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </form>
  );
};

export default POForm;
