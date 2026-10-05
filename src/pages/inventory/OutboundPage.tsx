import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { WashingMachine } from 'lucide-react';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { buildOutboundSchema, type OutboundFormData } from '@/lib/inventory/outboundFormSchema';
import { addDays } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WarehouseSelect } from '@/components/warehouse/WarehouseSelect';
import { LaundryVendorSelect } from '@/components/shared/LaundryVendorSelect';
import { MaintenanceRequestSelect } from '@/components/shared/MaintenanceRequestSelect';
import { DistributionForm } from '@/components/distribution/forms/DistributionForm';
import { useDistributionForm } from '@/components/distribution/hooks/useDistributionForm';
import { useCreateOutboundTransaction } from '@/hooks/useInventoryTransactions';
import { useCreateDistributionOrder } from '@/hooks/useDistributionOrders';
import { useCreateLaundryBatch } from '@/hooks/useLaundryBatches';
import { useLaundryVendors } from '@/hooks/useLaundryVendors';
import { useUsers } from '@/hooks/useUsers';
import { useItems } from '@/hooks/useItems';
import { useBreakpoint } from '@/lib/breakpoints';
import { MobileOutboundForm } from '@/components/inventory/MobileOutboundForm';
import { LaundryBatchFields } from '@/components/inventory/outbound/LaundryBatchFields';
import { StandardItemsFields } from '@/components/inventory/outbound/StandardItemsFields';

// Sprint 3: tách 2 sub-components LaundryBatchFields + StandardItemsFields ra file riêng
// để OutboundPage tập trung vào orchestration (schema + submit + tab switching).
// Schema/form contract giữ nguyên — không phá backend hợp đồng.




export function OutboundPage() {
  const { t } = useTranslation(['inventory', 'common', 'distribution', 'laundry'])
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  
  const { isMobile } = useBreakpoint();
  
  const distributionForm = useDistributionForm();
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  // Memo schema theo i18n.language để giữ identity ổn định cho useForm
  const outboundSchema = useMemo(() => buildOutboundSchema(t), [t]);
  
  const { mutate: createOutbound, isPending: isLoading } = useCreateOutboundTransaction();
  const { mutate: createDistributionOrder, isPending: isDistributionLoading } = useCreateDistributionOrder();
  const { mutate: createLaundryBatch, isPending: isLaundryLoading } = useCreateLaundryBatch();
  const { data: vendors = [] } = useLaundryVendors({ status: 'active' });
  const { users } = useUsers();
  const { data: itemsData } = useItems();
  const allItems = useMemo(() => itemsData?.items ?? [], [itemsData?.items]);
  
  const launderableItems = useMemo(() => allItems.filter(item => item.item_type === 'linen'), [allItems]);
  const staffUsers = users?.filter(u => u.user_level_code === 'staff' || u.user_level_code === 'manager') || [];
  
  const form = useForm<OutboundFormData>({
    resolver: zodResolver(outboundSchema),
    defaultValues: {
      transaction_category: 'room_assign',
      from_warehouse_id: '',
      to_location: '',
      vendor_id: undefined,
      maintenance_request_id: undefined,
      items: [{ item_id: '', quantity: 1, available_quantity: 0, notes: '' }],
      recipient_name: '',
      photos: [],
      notes: '',
      delivery_date: new Date(),
      expected_return_date: addDays(new Date(), 3),
      delivery_staff_id: undefined,
      receiver_name: '',
      laundry_items: [{ item_id: '', quantity: 1, weight_kg: 0, available_quantity: 0, condition_note: '' }],
    }
  });
  
  const formItems = form.watch('items') || [];
  const laundryItems = form.watch('laundry_items') || [];
  const category = form.watch('transaction_category');
  const totalQuantity = formItems.reduce((sum, item) => sum + item.quantity, 0);
  const hasStockError = formItems.some(item => item.quantity > item.available_quantity);
  const laundryHasStockError = laundryItems.some(item => item.quantity > item.available_quantity);


  if (isMobile) return <MobileOutboundForm />;
  
  const isAnyPending = isLoading || isDistributionLoading || isLaundryLoading;

  const goToList = () => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('tab', 'operations');
      p.set('sub', 'outbound');
      p.set('view', 'list');
      return p;
    }, { replace: true });
  };

  const onSubmit = (data: OutboundFormData) => {
    if (data.transaction_category === 'room_assign') {
      const validAllocations = distributionForm.allocations.filter(a => a.items.length > 0);
      if (validAllocations.length === 0) {
        toast.error('Vui lòng chọn phòng và thêm sản phẩm để giao');
        return;
      }
      createDistributionOrder({
        assigned_to: distributionForm.assignedTo || undefined,
        notes: distributionForm.notes || undefined,
        rooms: validAllocations,
      }, {
        onSuccess: () => {
          toast.success('Đã tạo phiếu giao hàng');
          distributionForm.reset?.();
          goToList();
        }
      });
    } else if (data.transaction_category === 'laundry') {
      if (!data.vendor_id || !data.delivery_date || !data.expected_return_date || !data.delivery_staff_id || !data.receiver_name) {
        toast.error('Vui lòng điền đầy đủ thông tin lô giặt');
        return;
      }
      const validLaundryItems = (data.laundry_items || []).filter(item => item.item_id && item.quantity > 0);
      if (validLaundryItems.length === 0) {
        toast.error('Vui lòng thêm sản phẩm vào lô giặt');
        return;
      }
      createLaundryBatch({
        step1: { vendor_id: data.vendor_id, delivery_date: data.delivery_date, expected_return_date: data.expected_return_date, delivery_staff_id: data.delivery_staff_id, receiver_name: data.receiver_name, notes: data.notes },
        step2: { items: validLaundryItems.map(item => ({ item_id: item.item_id, quantity: item.quantity, weight_kg: item.weight_kg || 0, condition_note: item.condition_note })) },
        step3: { confirmed: true }
      }, {
        onSuccess: () => {
          toast.success('Đã tạo lô giặt');
          form.reset();
          goToList();
        }
      });
    } else {
      createOutbound(data as any, {
        onSuccess: () => {
          toast.success('Đã ghi nhận xuất kho');
          form.reset();
          goToList();
        }
      });
    }
  };


  return (
    <div className="space-y-4">
      <Form {...form}>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* General Info */}
          <div className="border rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium">{t('inventory:outbound.generalInfo')}</p>
            <FormField control={form.control} name="transaction_category" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">{t('inventory:outbound.type')} *</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t('inventory:outbound.type')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="room_assign">{t('inventory:outbound.toRoom')}</SelectItem>
                      <SelectItem value="laundry">{t('inventory:outbound.toLaundry')}</SelectItem>
                      <SelectItem value="maintenance">{t('inventory:outbound.toMaintenance')}</SelectItem>
                      <SelectItem value="disposal">{t('inventory:outbound.toDisposal')}</SelectItem>
                      <SelectItem value="other">{t('inventory:outbound.toOther')}</SelectItem>

                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            
            <div className="grid gap-3 md:grid-cols-2">
              {category !== 'room_assign' && (
                <FormField control={form.control} name="from_warehouse_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('inventory:outbound.fromLocation')} *</FormLabel>
                    <FormControl>
                      <WarehouseSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder={t('inventory:outbound.placeholders.fromLocation')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              
              {category === 'laundry' && (
                <FormField control={form.control} name="vendor_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('inventory:outbound.selectVendor')} *</FormLabel>
                    <FormControl>
                      <LaundryVendorSelect value={field.value || ''} onChange={(value, vendor) => { field.onChange(value); setSelectedVendor(vendor); }} placeholder={t('inventory:outbound.placeholders.selectVendor')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {category === 'maintenance' && (
                <FormField control={form.control} name="maintenance_request_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('inventory:outbound.selectMaintenanceRequest')}</FormLabel>
                    <FormControl><MaintenanceRequestSelect value={field.value || ''} onChange={field.onChange} placeholder={t('inventory:outbound.placeholders.selectMaintenanceRequest')} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {(category === 'disposal' || category === 'other') && (
                <FormField control={form.control} name="to_location" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('inventory:outbound.toLocation')} *</FormLabel>
                    <FormControl><Input {...field} placeholder={t('inventory:outbound.placeholders.toLocation')} className="h-9" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>
          </div>
          
          {/* Distribution form inline */}
          {category === 'room_assign' && (
            <DistributionForm form={distributionForm} />
          )}
          
          {/* Laundry Batch Form (Sprint 3: extracted) */}
          {category === 'laundry' && (
            <LaundryBatchFields
              form={form}
              launderableItems={launderableItems}
              staffUsers={staffUsers}
              selectedVendor={selectedVendor}
            />
          )}

          {/* Items + Photos + Notes (Sprint 3: extracted, shared by maintenance/disposal/other) */}
          {category !== 'room_assign' && category !== 'laundry' && (
            <StandardItemsFields form={form} />
          )}

          
          {/* Summary for non room_assign and non laundry */}
          {category !== 'room_assign' && category !== 'laundry' && (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex gap-4 text-sm">
                <span>{formItems.length} loại</span>
                <span className="text-red-600 font-medium">-{totalQuantity} đơn vị</span>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={goToList}>{t('common:cancel')}</Button>
                <Button type="submit" size="sm" disabled={isAnyPending || hasStockError}>{isAnyPending ? t('inventory:outbound.processing') : t('inventory:outbound.confirm')}</Button>
              </div>

            </div>
          )}
          
          {/* Summary for room_assign */}
          {category === 'room_assign' && distributionForm.allocations.length > 0 && (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex gap-4 text-sm">
                <span>{distributionForm.summary.roomCount} phòng</span>
                <span>{distributionForm.summary.itemTypesCount} loại</span>
                <span className="text-blue-600 font-medium">{distributionForm.summary.totalItems} đơn vị</span>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={goToList}>{t('common:cancel')}</Button>
                <Button type="submit" size="sm" disabled={isAnyPending || !distributionForm.isValid}>{isAnyPending ? t('distribution:createOrder.creating') : t('distribution:createOrder.create')}</Button>
              </div>

            </div>
          )}
          
          {/* Summary for laundry */}
          {category === 'laundry' && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={goToList}>{t('common:cancel')}</Button>
              <Button type="submit" size="sm" disabled={isAnyPending || laundryHasStockError || laundryItems.filter(i => i.item_id).length === 0}>
                <WashingMachine className="mr-1.5 h-4 w-4" />
                {isAnyPending ? t('laundry:batch.creating') : t('laundry:batch.createBatch')}
              </Button>

            </div>
          )}
        </form>
      </Form>
    </div>
  );
}
