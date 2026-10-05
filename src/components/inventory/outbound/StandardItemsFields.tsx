import type { UseFormReturn } from 'react-hook-form'
import { useFieldArray } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Plus, X, AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { ItemSelect } from '@/components/shared/ItemSelect'
import { ImageUpload } from '@/components/shared/ImageUpload'
import { cn } from '@/lib/utils'
import type { OutboundFormData } from '@/lib/inventory/outboundFormSchema'

interface Props {
  form: UseFormReturn<OutboundFormData>
}

/**
 * Sprint 3: shared block cho 3 nhóm xuất kho không có flow riêng
 * (maintenance | disposal | other). Bao gồm danh sách items + ảnh + ghi chú.
 */
export function StandardItemsFields({ form }: Props) {
  const { t } = useTranslation(['inventory', 'common'])

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const formItems = form.watch('items') || []

  return (
    <>
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('inventory:outbound.itemsToOutbound')}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => append({ item_id: '', quantity: 1, available_quantity: 0, notes: '' })}
          >
            <Plus className="mr-1 h-3 w-3" />{t('inventory:outbound.addItem')}
          </Button>
        </div>

        <div className="space-y-2">
          {fields.map((field, index) => {
            const currentItem = formItems[index]
            const hasError = (currentItem?.quantity || 0) > (currentItem?.available_quantity || 0)
            const willBeLowStock = (currentItem?.available_quantity || 0) > 0 && (currentItem?.available_quantity || 0) - (currentItem?.quantity || 0) < 10

            return (
              <div key={field.id} className={cn('relative p-3 border rounded-lg bg-muted/20', hasError && 'border-destructive')}>
                {fields.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-6 w-6" onClick={() => remove(index)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}

                <div className="grid gap-2 md:grid-cols-3">
                  <FormField control={form.control} name={`items.${index}.item_id`} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{t('inventory:fields.item')} *</FormLabel>
                      <FormControl>
                        <ItemSelect
                          value={field.value}
                          onChange={(value, item) => {
                            field.onChange(value)
                            if (item) form.setValue(`items.${index}.available_quantity`, item.quantity_in_stock)
                          }}
                          placeholder={t('inventory:outbound.selectItem')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{t('inventory:outbound.quantityToOutbound')} *</FormLabel>
                      <FormControl>
                        <Input
                          type="number" min={0}
                          className={cn('h-9', hasError && 'border-destructive')}
                          {...field}
                          onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Tồn: <span className="font-medium">{currentItem?.available_quantity || 0}</span>
                        {' • '}
                        Còn: <span className={willBeLowStock ? 'text-yellow-600 font-medium' : ''}>
                          {(currentItem?.available_quantity || 0) - (currentItem?.quantity || 0)}
                        </span>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name={`items.${index}.notes`} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{t('inventory:outbound.itemNote')}</FormLabel>
                      <FormControl><Input {...field} placeholder="Ghi chú..." className="h-9" /></FormControl>
                    </FormItem>
                  )} />
                </div>

                {hasError && (
                  <Alert variant="destructive" className="mt-2 py-2">
                    <AlertTriangle className="h-3 w-3" />
                    <AlertDescription className="text-xs">{t('inventory:outbound.exceedStock')}</AlertDescription>
                  </Alert>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium">{t('inventory:outbound.photos')}</p>
        <FormField control={form.control} name="photos" render={({ field }) => (
          <FormItem>
            <FormControl><ImageUpload images={field.value || []} onChange={field.onChange} maxImages={10} /></FormControl>
          </FormItem>
        )} />
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">{t('inventory:outbound.generalNotes')}</FormLabel>
            <FormControl><Textarea {...field} placeholder={t('inventory:outbound.notesPlaceholder')} rows={2} /></FormControl>
          </FormItem>
        )} />
      </div>
    </>
  )
}
