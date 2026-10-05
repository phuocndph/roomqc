import { useMemo } from 'react'
import type { UseFormReturn, FieldArrayWithId } from 'react-hook-form'
import { useFieldArray } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Plus, X, AlertTriangle, WashingMachine, Calendar, Scale, DollarSign } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import type { OutboundFormData } from '@/lib/inventory/outboundFormSchema'

interface Props {
  form: UseFormReturn<OutboundFormData>
  launderableItems: Array<{ id: string; name: string; quantity_in_stock?: number }>
  staffUsers: Array<{ id: string; full_name: string }>
  selectedVendor: any
}

/**
 * Sprint 3: extracted from OutboundPage to keep that page focused on orchestration.
 * Form contract unchanged — chỉ tách JSX cộng đồng dùng FieldArray laundry_items.
 */
export function LaundryBatchFields({ form, launderableItems, staffUsers, selectedVendor }: Props) {
  const { t } = useTranslation(['inventory', 'common', 'laundry'])

  const { fields: laundryFields, append, remove } = useFieldArray({
    control: form.control,
    name: 'laundry_items',
  })

  const laundryItems = form.watch('laundry_items') || []
  const laundryTotalItems = laundryItems.reduce((sum, it) => sum + (it.quantity || 0), 0)
  const laundryTotalWeight = laundryItems.reduce((sum, it) => sum + (it.weight_kg || 0), 0)
  const laundryEstimatedCost = useMemo(() => {
    const pricePerKg = selectedVendor?.contract_info?.price_per_kg || 20000
    return laundryTotalWeight * pricePerKg
  }, [selectedVendor, laundryTotalWeight])
  const laundryHasStockError = laundryItems.some(it => it.quantity > (it.available_quantity || 0))

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <WashingMachine className="h-4 w-4" />
        <p className="text-sm font-medium">{t('laundry:batch.createNew')}</p>
      </div>

      {/* Dates & Staff */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <FormField control={form.control} name="delivery_date" render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel className="text-xs">{t('laundry:batch.deliveryDate')} *</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button variant="outline" className={cn('h-9 w-full justify-start text-left text-sm', !field.value && 'text-muted-foreground')}>
                    {field.value ? format(field.value, 'dd/MM/yyyy', { locale: vi }) : t('common:selectDate')}
                    <Calendar className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarUI mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="expected_return_date" render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel className="text-xs">{t('laundry:batch.expectedReturnDate')} *</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button variant="outline" className={cn('h-9 w-full justify-start text-left text-sm', !field.value && 'text-muted-foreground')}>
                    {field.value ? format(field.value, 'dd/MM/yyyy', { locale: vi }) : t('common:selectDate')}
                    <Calendar className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarUI mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="delivery_staff_id" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">{t('laundry:batch.deliveryStaff')} *</FormLabel>
            <Select value={field.value || ''} onValueChange={field.onChange}>
              <FormControl><SelectTrigger className="h-9"><SelectValue placeholder={t('laundry:batch.selectStaff')} /></SelectTrigger></FormControl>
              <SelectContent>
                {staffUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="receiver_name" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">{t('laundry:batch.receiverName')} *</FormLabel>
            <FormControl><Input {...field} placeholder={t('laundry:batch.receiverNamePlaceholder')} className="h-9" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>

      {/* Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">{t('laundry:batch.itemsList')}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => append({ item_id: '', quantity: 1, weight_kg: 0, available_quantity: 0, condition_note: '' })}
          >
            <Plus className="mr-1 h-3 w-3" />{t('laundry:batch.addItem')}
          </Button>
        </div>

        <div className="border rounded-lg divide-y">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-xs font-medium">
            <div className="col-span-4">{t('inventory:fields.item')}</div>
            <div className="col-span-2 text-center">{t('laundry:batch.inStock')}</div>
            <div className="col-span-2 text-center">{t('laundry:batch.quantity')}</div>
            <div className="col-span-2 text-center">{t('laundry:batch.weightKg')}</div>
            <div className="col-span-1 text-center">{t('laundry:batch.note')}</div>
            <div className="col-span-1"></div>
          </div>

          {laundryFields.map((field, index) => {
            const currentItem = laundryItems[index]
            const hasError = (currentItem?.quantity || 0) > (currentItem?.available_quantity || 0)

            return (
              <div key={field.id} className={cn('grid grid-cols-12 gap-2 px-3 py-2 items-center', hasError && 'bg-destructive/5')}>
                <div className="col-span-4">
                  <FormField control={form.control} name={`laundry_items.${index}.item_id`} render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Select
                          value={field.value || ''}
                          onValueChange={(value) => {
                            field.onChange(value)
                            const selected = launderableItems.find(i => i.id === value)
                            if (selected) form.setValue(`laundry_items.${index}.available_quantity`, selected.quantity_in_stock || 0)
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('laundry:batch.selectItem')} /></SelectTrigger>
                          <SelectContent>
                            {launderableItems.map(it => <SelectItem key={it.id} value={it.id} className="text-xs">{it.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
                <div className="col-span-2 text-center text-xs">
                  <span className={cn('font-medium', (currentItem?.available_quantity || 0) < 10 && 'text-yellow-600')}>
                    {currentItem?.available_quantity || 0}
                  </span>
                </div>
                <div className="col-span-2">
                  <FormField control={form.control} name={`laundry_items.${index}.quantity`} render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          className={cn('h-8 text-center text-xs', hasError && 'border-destructive')}
                          {...field}
                          onChange={e => field.onChange(parseInt(e.target.value) || 1)}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
                <div className="col-span-2">
                  <FormField control={form.control} name={`laundry_items.${index}.weight_kg`} render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          className="h-8 text-center text-xs"
                          placeholder="0.0"
                          {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
                <div className="col-span-1">
                  <FormField control={form.control} name={`laundry_items.${index}.condition_note`} render={({ field }) => (
                    <FormItem>
                      <FormControl><Input className="h-8 text-xs" placeholder="..." {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <div className="col-span-1 text-center">
                  {laundryFields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(index)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {laundryHasStockError && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-xs">{t('inventory:outbound.exceedStock')}</AlertDescription>
          </Alert>
        )}
      </div>

      <FormField control={form.control} name="notes" render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs">{t('laundry:batch.notes')}</FormLabel>
          <FormControl><Textarea {...field} placeholder={t('laundry:batch.notesPlaceholder')} rows={2} /></FormControl>
        </FormItem>
      )} />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 p-3 border rounded-lg bg-muted/30">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">{t('laundry:batch.totalItems')}</p>
          <p className="text-xl font-bold">{laundryTotalItems}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Scale className="h-3 w-3" />{t('laundry:batch.totalWeight')}
          </div>
          <p className="text-xl font-bold">{laundryTotalWeight.toFixed(1)} kg</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3" />{t('laundry:batch.estimatedCost')}
          </div>
          <p className="text-xl font-bold text-primary">{formatCurrency(laundryEstimatedCost)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">{t('laundry:batch.pricePerKg')}</p>
          <p className="text-sm font-medium">{formatCurrency(selectedVendor?.contract_info?.price_per_kg || 20000)}/kg</p>
        </div>
      </div>
    </div>
  )
}
