import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { ArrowLeft, Save } from 'lucide-react';
import { useQuotaCheck } from '@/hooks/useQuotaCheck';
import { QuotaExceededDialog } from '@/components/settings/usage/QuotaExceededDialog';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageUpload } from '@/components/shared/ImageUpload';
import { navigateBack } from '@/lib/navigation';
import { useItem, useCreateItem, useUpdateItem } from '@/hooks/useItems';
import { useItemImages, useAddItemImage, useDeleteItemImage } from '@/hooks/useItemImages';
import { useCategories } from '@/hooks/useCategories';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useUser } from '@/hooks/useUser';
import { useBreakpoint } from '@/lib/breakpoints';
import { useHotelContext } from '@/contexts/HotelContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { HotelBadge } from '@/components/layout/HotelBadge';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

const ITEM_TYPES = ['linen', 'consumable', 'equipment', 'furniture'] as const;
type ItemFormData = z.infer<ReturnType<typeof createItemSchema>>;

function createItemSchema(t: (key: string) => string) {
  return z.object({
    code: z.string().min(1, t('items:validation.codeRequired')),
    name: z.string().min(1, t('items:validation.nameRequired')),
    name_en: z.string().optional(),
    description: z.string().optional(),
    category_id: z.string().uuid(t('items:validation.categoryRequired')),
    item_type: z.enum(['linen', 'consumable', 'equipment', 'furniture']),
    unit: z.string().min(1, t('items:validation.unitRequired')),
    unit_price: z.number().min(0, t('items:validation.priceMin')),
    minimum_stock: z.number().min(0, t('items:validation.stockMin')),
    reorder_point: z.number().min(0, t('items:validation.reorderMin')),
    brand: z.string().optional(),
    model: z.string().optional(),
    images: z.array(z.string()).optional(),
    // Chargeable settings
    is_chargeable: z.boolean().default(false),
    is_complimentary: z.boolean().default(true),
    charge_price: z.number().min(0).nullable().optional(),
  });
}
export function ItemFormPage() {
  const {
    id
  } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isMobile
  } = useBreakpoint();
  const {
    t
  } = useTranslation(['items', 'common']);
  const isEdit = !!id;
  const copyFrom = location.state?.copyFrom;
  const {
    tenantId
  } = useUser();
  const {
    selectedHotel,
    isAllHotelsMode
  } = useHotelContext();
  const {
    data: itemData,
    isLoading: itemLoading
  } = useItem(id);
  const item = itemData?.item;
  const {
    data: itemImages = []
  } = useItemImages(id);
  const {
    data: categories,
    isLoading: categoriesLoading
  } = useCategories();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const addItemImage = useAddItemImage();
  const deleteItemImage = useDeleteItemImage();
  const quotaCheck = useQuotaCheck('item');
  const [images, setImages] = useState<string[]>([]);
  const itemSchema = createItemSchema(t);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: {
      errors,
      isSubmitting
    }
  } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      unit: 'cái',
      unit_price: 0,
      minimum_stock: 10,
      reorder_point: 20,
      item_type: 'equipment',
      is_chargeable: false,
      is_complimentary: true,
      charge_price: null,
    }
  });

  // Handle copy mode
  useEffect(() => {
    if (copyFrom) {
      setValue('code', `${copyFrom.code}-COPY-${Date.now().toString().slice(-4)}`);
      setValue('name', `${copyFrom.name} (Copy)`);
      setValue('name_en', copyFrom.name_en || '');
      setValue('description', copyFrom.description || '');
      setValue('category_id', copyFrom.category_id || '');
      setValue('item_type', copyFrom.item_type || 'equipment');
      setValue('unit', copyFrom.unit || 'cái');
      setValue('unit_price', copyFrom.unit_price || 0);
      setValue('minimum_stock', copyFrom.minimum_stock || 10);
      setValue('reorder_point', copyFrom.reorder_point || 20);
      setValue('brand', copyFrom.brand || '');
      setValue('model', copyFrom.model || '');
      setValue('is_chargeable', copyFrom.is_chargeable || false);
      setValue('is_complimentary', copyFrom.is_complimentary ?? true);
      setValue('charge_price', copyFrom.charge_price || null);
    }
  }, [copyFrom, setValue]);

  // Load item data for edit mode
  useEffect(() => {
    if (item && isEdit && !copyFrom) {
      
      reset({
        code: item.code || '',
        name: item.name || '',
        name_en: item.name_en || '',
        description: item.description || '',
        category_id: item.category_id || '',
        item_type: item.item_type || 'equipment',
        unit: item.unit || 'cái',
        unit_price: item.unit_price || 0,
        minimum_stock: item.minimum_stock || 10,
        reorder_point: item.reorder_point || 20,
        brand: item.brand || '',
        model: item.model || '',
        is_chargeable: item.is_chargeable || false,
        is_complimentary: item.is_complimentary ?? true,
        charge_price: item.charge_price || null,
      });
    }
  }, [item, isEdit, copyFrom, reset]);

  // Load images from item_images table when editing
  useEffect(() => {
    if (itemImages && itemImages.length > 0) {
      const imageUrls = itemImages.map(img => img.url);
      setImages(imageUrls);
    }
  }, [itemImages]);
  const onSubmit = async (data: ItemFormData) => {
    if (isAllHotelsMode) {
      toast.error(t('items:alerts.selectHotelToCreate'));
      return;
    }
    if (!selectedHotel?.id) {
      toast.error(t('items:alerts.selectHotelFirst'));
      return;
    }
    if (!isEdit && !quotaCheck.checkQuota()) {
      return;
    }
    try {
      
      
      const {
        images: _,
        ...itemDataWithoutImages
      } = data as any;
      let savedItemId: string;
      if (isEdit) {
        await updateItem.mutateAsync({
          id: id!,
          data: {
            ...itemDataWithoutImages,
            updated_at: new Date().toISOString()
          }
        });
        savedItemId = id!;
      } else {
        const result = await createItem.mutateAsync({
          ...itemDataWithoutImages,
          tenant_id: tenantId,
          hotel_id: selectedHotel.id,
          quantity_total: 0,
          quantity_in_stock: 0,
          quantity_in_use: 0,
          quantity_in_laundry: 0,
          quantity_damaged: 0,
          quantity_lost: 0,
          status: 'active'
        });
        savedItemId = result.id;
      }
      if (images.length > 0) {
        const existingImageUrls = itemImages.map(img => img.url);
        const imagesToDelete = itemImages.filter(img => !images.includes(img.url));
        for (const img of imagesToDelete) {
          await deleteItemImage.mutateAsync(img.id);
        }
        const newImages = images.filter(url => !existingImageUrls.includes(url));
        for (let i = 0; i < newImages.length; i++) {
          await addItemImage.mutateAsync({
            itemId: savedItemId,
            tenantId: tenantId,
            url: newImages[i],
            isPrimary: i === 0 && existingImageUrls.length === 0
          });
        }
      }
      toast.success(isEdit ? t('items:messages.updateSuccess') : t('items:messages.createSuccess'));
      navigate('/inventory?tab=assets&sub=items');
    } catch (error) {
      console.error('Submit error:', error);
      toast.error(t('items:messages.saveError'));
    }
  };

  // Wait for item and categories to load in edit mode
  if (isEdit && (itemLoading || categoriesLoading || !item)) {
    return <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/items')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">{t('items:loading')}</h1>
        </div>
      </div>;
  }
  return <>
      <QuotaExceededDialog open={quotaCheck.showDialog} onOpenChange={quotaCheck.setShowDialog} resourceType="item" currentUsage={quotaCheck.currentUsage} limit={quotaCheck.limit} />
      <div className="space-y-4 pb-20">
        {/* Header */}
        <div className={`flex items-center gap-3 ${isMobile ? 'sticky top-0 z-10 bg-background py-3 -mx-4 px-4 border-b' : ''}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateBack(navigate, '/items')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className={`font-semibold truncate ${isMobile ? 'text-lg' : 'text-xl'}`}>
              {isEdit ? t('items:editItem') : t('items:addNew')}
            </h1>
          </div>
          {!isMobile && <HotelBadge />}
        </div>

        {/* Alert for All Hotels Mode */}
        {isAllHotelsMode && <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {t('items:alerts.allHotelsMode')}
            </AlertDescription>
          </Alert>}

        {!isAllHotelsMode && !selectedHotel && <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {t('items:alerts.noHotelSelected')}
            </AlertDescription>
          </Alert>}

        {!isEdit && !warehousesLoading && warehouses && warehouses.length === 0 && (
          <Alert className="py-3 border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm flex items-center justify-between">
              <span>Vui lòng tạo kho hàng trước khi thêm tài sản.</span>
              <Button size="sm" variant="outline" className="h-7 ml-3" type="button" onClick={() => navigate('/inventory?tab=settings&sub=warehouses')}>
                Tạo kho hàng
              </Button>
            </AlertDescription>
          </Alert>
        )}

      {!isEdit && !warehousesLoading && warehouses && warehouses.length === 0 ? null :
      <form key={item?.id || 'new'} onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {isMobile ?
        // Mobile: Accordion layout
        <Accordion type="multiple" defaultValue={['basic', 'product']} className="space-y-3">
            <AccordionItem value="basic" className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-medium py-3">
                {t('items:form.sections.basicInfo')}
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <div className="space-y-1.5">
                  <Label htmlFor="code" className="text-xs">{t('items:fields.code')} *</Label>
                  <Input id="code" {...register('code')} className="h-10" />
                  {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="category_id" className="text-xs">{t('items:fields.category')} *</Label>
                  <Select value={watch('category_id')} onValueChange={value => {
                    setValue('category_id', value)
                    // Auto-fill item_type based on category's default_item_type
                    const category = categories?.find(c => c.id === value)
                    if (category?.default_item_type) {
                      setValue('item_type', category.default_item_type as any)
                      toast.info(`Đã tự động chọn loại: ${category.default_item_type === 'linen' ? 'Đồ vải' : category.default_item_type === 'consumable' ? 'Tiêu hao' : category.default_item_type === 'equipment' ? 'Thiết bị' : 'Nội thất'}`)
                    }
                  }}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={t('items:form.selectCategory')} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map(cat => <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                  {errors.category_id && <p className="text-xs text-destructive">{errors.category_id.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="item_type" className="text-xs">{t('items:fields.itemType')} *</Label>
                  <Select value={watch('item_type')} onValueChange={(value: any) => setValue('item_type', value)}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={t('items:form.selectItemType')} />
                    </SelectTrigger>
                    <SelectContent>
                      {ITEM_TYPES.map(type => <SelectItem key={type} value={type}>
                          {t(`items:itemType.${type}`)}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs">{t('items:fields.name')} *</Label>
                  <Input id="name" {...register('name')} className="h-10" />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name_en" className="text-xs">{t('items:fields.nameEn')}</Label>
                  <Input id="name_en" {...register('name_en')} className="h-10" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs">{t('items:fields.description')}</Label>
                  <Textarea id="description" {...register('description')} rows={2} />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="product" className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-medium py-3">
                {t('items:form.sections.productInfo')}
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="brand" className="text-xs">{t('items:fields.brand')}</Label>
                    <Input id="brand" {...register('brand')} className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="model" className="text-xs">{t('items:fields.model')}</Label>
                    <Input id="model" {...register('model')} className="h-10" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="unit" className="text-xs">{t('items:fields.unit')} *</Label>
                    <Input id="unit" {...register('unit')} className="h-10" />
                    {errors.unit && <p className="text-xs text-destructive">{errors.unit.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="unit_price" className="text-xs">{t('items:fields.unitPrice')} *</Label>
                    <Input id="unit_price" type="number" min={0} step="0.01" {...register('unit_price', { valueAsNumber: true })} className="h-10" />
                    {errors.unit_price && <p className="text-xs text-destructive">{errors.unit_price.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="minimum_stock" className="text-xs">{t('items:fields.minimumStock')} *</Label>
                    <Input id="minimum_stock" type="number" min={0} {...register('minimum_stock', { valueAsNumber: true })} className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reorder_point" className="text-xs">{t('items:fields.reorderPoint')} *</Label>
                    <Input id="reorder_point" type="number" min={0} {...register('reorder_point', { valueAsNumber: true })} className="h-10" />
                  </div>
                </div>

                {/* Chargeable Settings - Only for consumables */}
                {watch('item_type') === 'consumable' && (
                  <div className="border-t pt-3 mt-3 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">Thiết lập tính phí</p>
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="is_chargeable" className="text-sm font-medium">
                          Có tính phí khách
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Minibar, đồ uống, snack...
                        </p>
                      </div>
                      <Switch
                        id="is_chargeable"
                        checked={watch('is_chargeable')}
                        onCheckedChange={(checked) => {
                          setValue('is_chargeable', checked);
                          if (checked) {
                            setValue('is_complimentary', false);
                          }
                        }}
                      />
                    </div>

                    {watch('is_chargeable') && (
                      <div className="space-y-1.5 pl-0">
                        <Label htmlFor="charge_price" className="text-xs">
                          Giá bán cho khách (₫)
                        </Label>
                        <Input
                          id="charge_price"
                          type="number" min={0}
                          placeholder={`Mặc định: ${watch('unit_price')?.toLocaleString() || 0}`}
                          {...register('charge_price', { valueAsNumber: true })}
                          className="h-10"
                        />
                        <p className="text-xs text-muted-foreground">
                          Để trống sẽ dùng giá nhập ({watch('unit_price')?.toLocaleString() || 0}₫)
                        </p>
                      </div>
                    )}

                    {!watch('is_chargeable') && (
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="is_complimentary" className="text-sm font-medium">
                            Miễn phí đi kèm phòng
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Bàn chải, xà phòng, dầu gội...
                          </p>
                        </div>
                        <Switch
                          id="is_complimentary"
                          checked={watch('is_complimentary')}
                          onCheckedChange={(checked) => setValue('is_complimentary', checked)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="images" className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-medium py-3">
                {t('items:form.sections.images')}
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <ImageUpload images={images} onChange={setImages} maxImages={5} className="grid-cols-3" />
              </AccordionContent>
            </AccordionItem>
          </Accordion> :
        // Desktop: Simple sections
        <>
        <div className="border rounded-lg p-4 space-y-4">
          <p className="text-sm font-medium">{t('items:form.sections.basicInfo')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="code" className="text-xs">{t('items:fields.code')} *</Label>
              <Input id="code" {...register('code')} className="h-9" />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="category_id" className="text-xs">{t('items:fields.category')} *</Label>
              <Select value={watch('category_id')} onValueChange={value => {
                setValue('category_id', value)
                // Auto-fill item_type based on category's default_item_type
                const category = categories?.find(c => c.id === value)
                if (category?.default_item_type) {
                  setValue('item_type', category.default_item_type as any)
                  toast.info(`Đã tự động chọn loại: ${category.default_item_type === 'linen' ? 'Đồ vải' : category.default_item_type === 'consumable' ? 'Tiêu hao' : category.default_item_type === 'equipment' ? 'Thiết bị' : 'Nội thất'}`)
                }
              }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t('items:form.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map(cat => <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>)}
                </SelectContent>
              </Select>
              {errors.category_id && <p className="text-xs text-destructive">{errors.category_id.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs">{t('items:fields.name')} *</Label>
              <Input id="name" {...register('name')} className="h-9" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name_en" className="text-xs">{t('items:fields.nameEn')}</Label>
              <Input id="name_en" {...register('name_en')} className="h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs">{t('items:fields.description')}</Label>
            <Textarea id="description" {...register('description')} rows={2} />
          </div>
        </div>

        <div className="border rounded-lg p-4 space-y-4">
          <p className="text-sm font-medium">{t('items:form.sections.productInfo')}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="brand" className="text-xs">{t('items:fields.brand')}</Label>
              <Input id="brand" {...register('brand')} className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model" className="text-xs">{t('items:fields.model')}</Label>
              <Input id="model" {...register('model')} className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="unit" className="text-xs">{t('items:fields.unit')} *</Label>
              <Input id="unit" {...register('unit')} className="h-9" />
              {errors.unit && <p className="text-xs text-destructive">{errors.unit.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="unit_price" className="text-xs">{t('items:fields.unitPrice')} *</Label>
              <Input id="unit_price" type="number" min={0} step="0.01" {...register('unit_price', { valueAsNumber: true })} className="h-9" />
              {errors.unit_price && <p className="text-xs text-destructive">{errors.unit_price.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="minimum_stock" className="text-xs">{t('items:fields.minimumStock')} *</Label>
              <Input id="minimum_stock" type="number" min={0} {...register('minimum_stock', { valueAsNumber: true })} className="h-9" />
              {errors.minimum_stock && <p className="text-xs text-destructive">{errors.minimum_stock.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reorder_point" className="text-xs">{t('items:fields.reorderPoint')} *</Label>
              <Input id="reorder_point" type="number" min={0} {...register('reorder_point', { valueAsNumber: true })} className="h-9" />
              {errors.reorder_point && <p className="text-xs text-destructive">{errors.reorder_point.message}</p>}
            </div>
          </div>

          {/* Chargeable Settings for Desktop - Only for consumables */}
          {watch('item_type') === 'consumable' && (
            <div className="border-t pt-4 mt-4 space-y-4">
              <p className="text-sm font-medium">Thiết lập tính phí khách</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="is_chargeable_desktop" className="text-sm font-medium">
                      Có tính phí khách
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Minibar, đồ uống, snack...
                    </p>
                  </div>
                  <Switch
                    id="is_chargeable_desktop"
                    checked={watch('is_chargeable')}
                    onCheckedChange={(checked) => {
                      setValue('is_chargeable', checked);
                      if (checked) {
                        setValue('is_complimentary', false);
                      }
                    }}
                  />
                </div>

                {!watch('is_chargeable') && (
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_complimentary_desktop" className="text-sm font-medium">
                        Miễn phí đi kèm phòng
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Bàn chải, xà phòng...
                      </p>
                    </div>
                    <Switch
                      id="is_complimentary_desktop"
                      checked={watch('is_complimentary')}
                      onCheckedChange={(checked) => setValue('is_complimentary', checked)}
                    />
                  </div>
                )}

                {watch('is_chargeable') && (
                  <div className="space-y-1.5">
                    <Label htmlFor="charge_price_desktop" className="text-xs">
                      Giá bán cho khách (₫)
                    </Label>
                    <Input
                      id="charge_price_desktop"
                      type="number" min={0}
                      placeholder={`Mặc định: ${watch('unit_price')?.toLocaleString() || 0}`}
                      {...register('charge_price', { valueAsNumber: true })}
                      className="h-9"
                    />
                    <p className="text-xs text-muted-foreground">
                      Để trống sẽ dùng giá nhập
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium">{t('items:form.sections.images')}</p>
          <ImageUpload images={images} onChange={setImages} maxImages={10} />
          <p className="text-xs text-muted-foreground">
            {t('items:form.imageHint')}
          </p>
        </div>

          </>}

        {/* Submit buttons */}
        <div className={`flex gap-2 ${isMobile ? 'fixed bottom-16 left-0 right-0 p-3 bg-background border-t z-30' : 'justify-end'}`}>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/inventory?tab=assets&sub=items')} className={isMobile ? 'flex-1' : ''}>
            {t('items:form.buttons.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting || isAllHotelsMode || !selectedHotel} className={isMobile ? 'flex-1' : ''}>
            <Save className="w-4 h-4 mr-1.5" />
            {isSubmitting ? t('items:form.buttons.saving') : isEdit ? t('items:form.buttons.update') : t('items:form.buttons.create')}
          </Button>
        </div>
      </form>}
    </div>
    </>;
}
