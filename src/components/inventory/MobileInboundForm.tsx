/**
 * MobileInboundForm — Single-page form for "Nhập kho" on mobile.
 *
 * Refactored in Sprint 1 (audit /inventory):
 *  - Removed 3-step wizard (Core rule: Zod forms must render all fields on a single page).
 *  - Unified schema with desktop via `inboundFormSchema` — uses `to_warehouse_id`
 *    instead of free-text `to_location`. Auto-picks default warehouse on mount.
 *  - Single sticky submit; Zod validates everything atomically.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { navigateBack } from '@/lib/navigation'
import { ArrowLeft, Plus, Minus, X, Save, Loader2, Package, Search, Check } from 'lucide-react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { TouchButton } from '@/components/mobile/TouchOptimized'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ImageUpload } from '@/components/shared/ImageUpload'
import { WarehouseSelect } from '@/components/warehouse/WarehouseSelect'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCreateInboundTransaction } from '@/hooks/useInventoryTransactions'
import { useItems } from '@/hooks/useItems'
import { useDefaultWarehouse } from '@/hooks/useWarehouses'
import { triggerHaptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import {
  inboundFormSchema,
  buildInboundDefaults,
  type InboundFormData,
} from '@/lib/inventory/inboundFormSchema'

const DRAFT_KEY = 'inbound_form_draft_v2'

interface PrefillFromAdjustment {
  adjustmentId: string
  adjustmentCode: string
  hotelId: string
  items: Array<{ item_id: string; quantity: number }>
  notes: string
}

const CATEGORY_OPTIONS: Array<{ value: InboundFormData['transaction_category']; label: string; description: string }> = [
  { value: 'purchase', label: 'Mua hàng', description: 'Nhập từ NCC' },
  { value: 'return', label: 'Trả lại', description: 'Khách/phòng trả' },
  { value: 'laundry', label: 'Giặt về', description: 'Nhận từ giặt là' },
  { value: 'other', label: 'Khác', description: 'Nguồn khác' },
]

export function MobileInboundForm() {
  const { t } = useTranslation(['inventory', 'common'])
  const navigate = useNavigate()
  const location = useLocation()
  const [searchQuery, setSearchQuery] = useState('')
  const [showItemSelector, setShowItemSelector] = useState(false)
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)

  const prefillFromAdjustment = (location.state as any)?.prefillFromAdjustment as
    | PrefillFromAdjustment
    | undefined
  const hasPrefill = !!prefillFromAdjustment

  const { mutate: createInbound, isPending: isLoading } = useCreateInboundTransaction()
  const { data: defaultWarehouse } = useDefaultWarehouse()
  const { data: itemsData, isLoading: isLoadingItems } = useItems(
    { search: searchQuery },
    1,
    50,
  )

  const form = useForm<InboundFormData>({
    resolver: zodResolver(inboundFormSchema),
    defaultValues: buildInboundDefaults({
      defaultWarehouseId: '',
      prefill: hasPrefill
        ? {
            items: prefillFromAdjustment!.items,
            notes: prefillFromAdjustment!.notes,
            relatedType: 'stock_adjustment',
            relatedId: prefillFromAdjustment!.adjustmentId,
            fromLocation: 'Bổ sung kiểm kê',
          }
        : undefined,
    }),
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })

  const items = form.watch('items')
  const category = form.watch('transaction_category')
  const toWarehouseId = form.watch('to_warehouse_id')
  const photos = form.watch('photos') || []
  const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0)

  // Auto-pick default warehouse on mount
  useEffect(() => {
    if (defaultWarehouse && !toWarehouseId) {
      form.setValue('to_warehouse_id', defaultWarehouse.id, { shouldValidate: true })
    }
  }, [defaultWarehouse, toWarehouseId, form])

  // Load draft (skip if prefill exists)
  useEffect(() => {
    if (hasPrefill || draftLoaded) return
    const draft = localStorage.getItem(DRAFT_KEY)
    if (!draft) return
    try {
      const data = JSON.parse(draft) as InboundFormData
      form.reset(data)
      setDraftLoaded(true)
      toast.info('Đã khôi phục bản nháp', {
        action: {
          label: 'Xoá',
          onClick: () => {
            localStorage.removeItem(DRAFT_KEY)
            form.reset(buildInboundDefaults({ defaultWarehouseId: defaultWarehouse?.id }))
          },
        },
      })
    } catch {
      // ignore
    }
    setDraftLoaded(true)
  }, [hasPrefill, draftLoaded, form, defaultWarehouse?.id])

  // Auto-save draft (debounced)
  useEffect(() => {
    const sub = form.watch((data) => {
      const timer = setTimeout(() => {
        if (form.formState.isDirty) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
        }
      }, 800)
      return () => clearTimeout(timer)
    })
    return () => sub.unsubscribe()
  }, [form])

  const addItem = (itemId: string) => {
    if (items.some((i) => i.item_id === itemId)) {
      toast.info('Đồ dùng đã có trong danh sách')
      return
    }
    triggerHaptic('success')
    append({ item_id: itemId, quantity: 1, notes: '' })
    setShowItemSelector(false)
  }

  const updateQuantity = (index: number, quantity: number) => {
    const newQty = Math.max(1, quantity)
    form.setValue(`items.${index}.quantity`, newQty, { shouldDirty: true, shouldValidate: true })
  }

  const handleBack = () => {
    if (form.formState.isDirty) setShowExitDialog(true)
    else navigateBack(navigate, '/inventory')
  }

  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form.getValues()))
    triggerHaptic('success')
    toast.success('Đã lưu nháp')
    navigate('/inventory?tab=operations&sub=transactions')
  }

  const handleDiscard = () => {
    localStorage.removeItem(DRAFT_KEY)
    navigateBack(navigate, '/inventory')
  }

  const handleSubmit = form.handleSubmit(
    (data) => {
      createInbound(data as any, {
        onSuccess: () => {
          localStorage.removeItem(DRAFT_KEY)
          triggerHaptic('success')
          toast.success('Đã tạo phiếu nhập')
          navigate('/inventory?tab=operations&sub=transactions')
        },
      })
    },
    (errors) => {
      triggerHaptic('error')
      const firstError = Object.values(errors).flat().find((e: any) => e?.message) as any
      if (firstError) toast.error(firstError.message || 'Vui lòng kiểm tra lại thông tin')
    },
  )

  const selectedCategory = CATEGORY_OPTIONS.find((c) => c.value === category)

  return (
    <div className="min-h-screen bg-background pb-40">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between px-3 py-2.5">
          <TouchButton variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </TouchButton>
          <h1 className="text-base font-semibold">Nhập kho</h1>
          <TouchButton variant="ghost" size="sm" onClick={handleSaveDraft} disabled={isLoading}>
            <Save className="h-4 w-4 mr-1" />
            Nháp
          </TouchButton>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* 1. Category */}
        <section>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Loại nhập
          </Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {CATEGORY_OPTIONS.map((opt) => {
              const selected = category === opt.value
              return (
                <TouchButton
                  key={opt.value}
                  type="button"
                  variant={selected ? 'default' : 'outline'}
                  className="h-16 flex-col gap-0.5 px-2"
                  onClick={() => {
                    form.setValue('transaction_category', opt.value, { shouldDirty: true })
                    triggerHaptic('light')
                  }}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-[11px] opacity-75">{opt.description}</span>
                </TouchButton>
              )
            })}
          </div>
        </section>

        {/* 2. From + To */}
        <section className="space-y-3">
          <div>
            <Label htmlFor="from_location" className="text-xs">
              Nguồn nhập *
            </Label>
            <Input
              id="from_location"
              placeholder="VD: NCC ABC, Khách trả, …"
              className={cn(
                'min-h-[44px] mt-1',
                form.formState.errors.from_location && 'border-destructive',
              )}
              {...form.register('from_location')}
            />
            {form.formState.errors.from_location && (
              <p className="text-xs text-destructive mt-1">
                {form.formState.errors.from_location.message}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Kho nhập *</Label>
            <WarehouseSelect
              value={toWarehouseId}
              onValueChange={(v) =>
                form.setValue('to_warehouse_id', v, { shouldDirty: true, shouldValidate: true })
              }
              placeholder="Chọn kho nhập"
              className="min-h-[44px] mt-1"
              error={!!form.formState.errors.to_warehouse_id}
            />
            {form.formState.errors.to_warehouse_id && (
              <p className="text-xs text-destructive mt-1">
                {form.formState.errors.to_warehouse_id.message}
              </p>
            )}
          </div>
        </section>

        {/* 3. Items */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Đồ dùng ({fields.length})
            </Label>
            <TouchButton
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setShowItemSelector(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Thêm
            </TouchButton>
          </div>

          {fields.length === 0 ? (
            <Card
              className={cn(
                'p-6 text-center border-dashed',
                form.formState.errors.items && 'border-destructive',
              )}
            >
              <Package className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Chưa có đồ dùng nào</p>
              <TouchButton
                type="button"
                size="sm"
                className="mt-3 h-9"
                onClick={() => setShowItemSelector(true)}
              >
                <Plus className="h-4 w-4 mr-1" /> Thêm đồ dùng
              </TouchButton>
              {form.formState.errors.items && (
                <p className="text-xs text-destructive mt-2">
                  {(form.formState.errors.items as any).message}
                </p>
              )}
            </Card>
          ) : (
            <div className="space-y-2">
              {fields.map((field, index) => {
                const item = itemsData?.items.find((i) => i.id === field.item_id)
                const img = item?.item_images?.[0]?.url
                return (
                  <Card key={field.id} className="p-3">
                    <div className="flex items-start gap-2.5">
                      {img ? (
                        <img
                          src={img}
                          alt={item?.name}
                          className="w-12 h-12 rounded-md object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">
                          {item?.name || 'Đồ dùng'}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">{item?.code}</p>
                        <div className="mt-2 flex items-center gap-1">
                          <TouchButton
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => updateQuantity(index, (items[index]?.quantity || 1) - 1)}
                            disabled={(items[index]?.quantity || 1) <= 1}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </TouchButton>
                          <Input
                            type="number"
                            value={items[index]?.quantity || 1}
                            onChange={(e) =>
                              updateQuantity(index, parseInt(e.target.value) || 1)
                            }
                            min={1}
                            className="h-9 w-16 text-center font-semibold tabular-nums"
                          />
                          <TouchButton
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => updateQuantity(index, (items[index]?.quantity || 1) + 1)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </TouchButton>
                        </div>
                      </div>
                      <TouchButton
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                        onClick={() => {
                          triggerHaptic('warning')
                          remove(index)
                        }}
                      >
                        <X className="h-4 w-4" />
                      </TouchButton>
                    </div>
                  </Card>
                )
              })}
              <div className="flex justify-between text-xs px-1 pt-1">
                <span className="text-muted-foreground">
                  {fields.length} loại — {totalQuantity} đơn vị
                </span>
              </div>
            </div>
          )}
        </section>

        {/* 4. Photos + notes */}
        <section className="space-y-3">
          <div>
            <Label className="text-xs">Ảnh đính kèm</Label>
            <ImageUpload
              images={photos}
              onChange={(urls) => form.setValue('photos', urls, { shouldDirty: true })}
              maxImages={10}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="notes" className="text-xs">
              Ghi chú
            </Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="Mô tả ngắn về phiếu nhập…"
              className="resize-none mt-1"
              {...form.register('notes')}
            />
          </div>
        </section>

        {/* 5. Summary */}
        <Card className="p-3 bg-muted/40">
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Loại:</span>
              <span className="font-medium">{selectedCategory?.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Số loại đồ:</span>
              <span className="font-medium tabular-nums">{fields.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tổng số lượng:</span>
              <span className="font-semibold tabular-nums text-green-600">
                +{totalQuantity}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Sticky submit */}
      <div className="fixed bottom-16 left-0 right-0 p-3 bg-background border-t z-40">
        <TouchButton
          type="button"
          onClick={handleSubmit}
          className="w-full h-12"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang xử lý…
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" /> Xác nhận nhập kho
            </>
          )}
        </TouchButton>
      </div>

      {/* Item selector sheet */}
      <Sheet open={showItemSelector} onOpenChange={setShowItemSelector}>
        <SheetContent side="bottom" className="h-[80vh]">
          <SheetHeader>
            <SheetTitle>Chọn đồ dùng</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm tên hoặc mã đồ…"
                className="pl-10 min-h-[44px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {isLoadingItems ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="p-3 animate-pulse">
                      <div className="flex gap-3">
                        <div className="w-12 h-12 rounded bg-muted" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-muted rounded w-3/4" />
                          <div className="h-3 bg-muted rounded w-1/2" />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : !itemsData?.items.length ? (
                <div className="text-center py-8">
                  <Search className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Không tìm thấy đồ dùng</p>
                </div>
              ) : (
                itemsData.items.map((item) => {
                  const img = item.item_images?.[0]?.url
                  const isSelected = items.some((i) => i.item_id === item.id)
                  return (
                    <Card
                      key={item.id}
                      className={cn(
                        'p-3 cursor-pointer transition-colors',
                        isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50',
                      )}
                      onClick={() => !isSelected && addItem(item.id)}
                    >
                      <div className="flex gap-3">
                        {img ? (
                          <img
                            src={img}
                            alt={item.name}
                            className="w-12 h-12 rounded object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">{item.code}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Tồn: {item.quantity_total || 0} {item.unit}
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

      {/* Exit confirm */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent className="max-w-[90vw] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Thoát phiếu nhập?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có thay đổi chưa lưu. Muốn lưu nháp hay bỏ qua?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <TouchButton onClick={handleSaveDraft} className="w-full h-11">
              <Save className="mr-2 h-4 w-4" /> Lưu nháp & thoát
            </TouchButton>
            <TouchButton variant="outline" onClick={handleDiscard} className="w-full h-11">
              Bỏ thay đổi & thoát
            </TouchButton>
            <TouchButton
              variant="ghost"
              onClick={() => setShowExitDialog(false)}
              className="w-full h-11"
            >
              Tiếp tục soạn
            </TouchButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
