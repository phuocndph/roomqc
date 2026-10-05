import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useItems } from '@/hooks/useItems'
import { useLaundryVendor } from '@/hooks/useLaundryVendors'
import { formatCurrency, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { CreateBatchStep1Data, CreateBatchStep2Data } from '@/types/laundry.types'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'

type Step2FormValues = {
  items: {
    item_id: string
    quantity: number
    weight_kg: number
    condition_note?: string
  }[]
}

interface CreateBatchStep2Props {
  initialData: CreateBatchStep2Data | null
  step1Data: CreateBatchStep1Data
  onComplete: (data: CreateBatchStep2Data) => void
  onBack: () => void
}

export function CreateBatchStep2({ initialData, step1Data, onComplete, onBack }: CreateBatchStep2Props) {
  const { t } = useTranslation('laundry')
  const { tenantId } = useUser()
  const itemsQuery = useItems({ status: 'active' }, 1, 1000)
  const { data: vendor } = useLaundryVendor(step1Data.vendor_id)
  
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
  
  const availableItems = itemsQuery.data?.items?.filter((item) => {
    const hasStock = (item.quantity_in_stock || 0) > 0
    const isLaunderable = item.category_id && launderableCategories?.includes(item.category_id)
    return hasStock && isLaunderable
  }) || []

  const createStep2Schema = (items: any[]) => z.object({
    items: z.array(
      z.object({
        item_id: z.string().min(1, t('createBatch.validation.selectItem')),
        quantity: z.number().min(1, t('createBatch.validation.quantityMin')),
        weight_kg: z.number().min(0, t('createBatch.validation.weightMin')),
        condition_note: z.string().optional(),
      })
    ).min(1, t('createBatch.validation.addAtLeastOneItem')),
  }).superRefine((data, ctx) => {
    data.items.forEach((item, index) => {
      const selectedItem = items.find(i => i.id === item.item_id)
      if (selectedItem && item.quantity > (selectedItem.quantity_in_stock || 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('createBatch.step2.onlyInStock', { count: selectedItem.quantity_in_stock, unit: selectedItem.unit }),
          path: ['items', index, 'quantity']
        })
      }
    })
  })
  
  const form = useForm<Step2FormValues>({
    resolver: zodResolver(createStep2Schema(availableItems)),
    defaultValues: initialData ? { items: initialData.items.map(item => ({ ...item, condition_note: item.condition_note || '' })) } : { items: [{ item_id: '', quantity: 1, weight_kg: 0, condition_note: '' }] },
  })
  
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const watchItems = form.watch('items')
  
  const totalItems = watchItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
  const totalWeight = watchItems.reduce((sum, item) => sum + (item.weight_kg || 0), 0)
  const pricePerKg = (vendor?.contract_info as any)?.price_per_kg || 0
  const estimatedCost = totalWeight * pricePerKg
  
  const onSubmit = (data: Step2FormValues) => onComplete(data as CreateBatchStep2Data)
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('createBatch.step2.title')}</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ item_id: '', quantity: 1, weight_kg: 0, condition_note: '' })}>
                <Plus className="mr-2 h-4 w-4" />{t('createBatch.step2.addItem')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">{t('createBatch.step2.item')} *</TableHead>
                      <TableHead className="w-24 text-center">{t('createBatch.step2.stock')}</TableHead>
                      <TableHead className="w-32">{t('createBatch.step2.quantity')} *</TableHead>
                      <TableHead className="w-32">{t('createBatch.step2.weight')} *</TableHead>
                      <TableHead>{t('createBatch.step2.conditionNote')}</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <FormField control={form.control} name={`items.${index}.item_id`} render={({ field }) => (
                            <FormItem>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder={t('createBatch.step2.selectItem')} /></SelectTrigger></FormControl>
                        <SelectContent>
                                  {itemsQuery.isLoading || isLoadingCategories ? (
                                    <SelectItem value="__loading__" disabled>
                                      {t('common:loading', 'Đang tải...')}
                                    </SelectItem>
                                  ) : availableItems.length === 0 ? (
                                    <SelectItem value="__empty__" disabled>
                                      {t('createBatch.step2.noLaunderableItems', 'Không có đồ vải có thể giặt trong kho')}
                                    </SelectItem>
                                  ) : (
                                    availableItems.map((item) => (
                                      <SelectItem key={item.id} value={item.id}>
                                        <div className="flex justify-between items-center w-full gap-3">
                                          <span>{item.name} ({item.code})</span>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">{t('createBatch.step2.stockLabel')}: {item.quantity_in_stock} {item.unit}</span>
                                            {(item.quantity_in_stock || 0) < 10 && <Badge variant="secondary" className="text-xs">{t('createBatch.step2.lowStock')}</Badge>}
                                          </div>
                                        </div>
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const selectedItem = availableItems.find(i => i.id === form.watch(`items.${index}.item_id`))
                            return selectedItem ? <span className={cn("font-medium", (selectedItem.quantity_in_stock || 0) < 10 && "text-orange-600")}>{selectedItem.quantity_in_stock} {selectedItem.unit}</span> : '-'
                          })()}
                        </TableCell>
                        <TableCell>
                          <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (
                            <FormItem><FormControl><Input type="number" min="1" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </TableCell>
                        <TableCell>
                          <FormField control={form.control} name={`items.${index}.weight_kg`} render={({ field }) => (
                            <FormItem><FormControl><Input type="number" step="0.1" min="0.1" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </TableCell>
                        <TableCell>
                          <FormField control={form.control} name={`items.${index}.condition_note`} render={({ field }) => (
                            <FormItem><FormControl><Input {...field} placeholder={t('createBatch.step2.conditionPlaceholder')} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </TableCell>
                        <TableCell>{fields.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader><CardTitle>{t('createBatch.step2.summary')}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-4">
              <div><dt className="text-sm text-muted-foreground">{t('createBatch.step2.totalItems')}</dt><dd className="text-2xl font-bold">{totalItems}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t('createBatch.step2.totalWeight')}</dt><dd className="text-2xl font-bold">{totalWeight.toFixed(2)} {t('units.kg')}</dd></div>
              <div>
                <dt className="text-sm text-muted-foreground">{t('createBatch.step2.estimatedCost')}</dt>
                <dd className="text-2xl font-bold">{estimatedCost > 0 ? formatCurrency(estimatedCost) : <span className="text-muted-foreground font-normal text-base">{t('createBatch.step2.notDetermined')}</span>}</dd>
                {estimatedCost === 0 && <p className="text-sm text-muted-foreground mt-2">💡 {t('createBatch.step2.costHint')}</p>}
              </div>
            </dl>
          </CardContent>
        </Card>
        
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>{t('createBatch.step2.back')}</Button>
          <Button type="submit">{t('createBatch.step2.next')}</Button>
        </div>
      </form>
    </Form>
  )
}
