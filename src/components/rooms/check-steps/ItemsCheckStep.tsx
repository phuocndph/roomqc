import { UseFormReturn } from 'react-hook-form';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { 
  RoomCheckFormData, 
  RoomItemWithDetails, 
  LaundryItem, 
  ConsumedItem, 
  LostItem, 
  ReplacedItem,
  DamagedItem
} from '@/types/rooms.types';
import type { ItemType } from '@/types/items.types';
import { DefaultOkItemsCheck } from './DefaultOkItemsCheck';
import { type CheckType } from '@/lib/roomCheckConfig';

interface ItemsCheckStepProps {
  form: UseFormReturn<RoomCheckFormData>;
  items: RoomItemWithDetails[];
  roomId: string;
  hotelId: string;
  tenantId: string;
  bookingId?: string | null;
  checkType: CheckType;
  phase?: 1 | 2;
  onQuantitiesChange?: (quantities: Record<string, number>) => void;
}

interface MissingItem {
  item_id: string;
  item_name: string;
  item_code?: string;
  item_type: 'linen' | 'consumable' | 'equipment' | 'furniture';
  missing_quantity: number;
  standard_quantity: number;
}

export function ItemsCheckStep({
  form,
  items,
  roomId,
  hotelId,
  tenantId,
  bookingId,
  checkType,
  phase,
  onQuantitiesChange
}: ItemsCheckStepProps) {
  const { toast } = useToast();

  // State for tracking items by action
  const [laundryItems, setLaundryItems] = useState<LaundryItem[]>([]);
  const [consumedItems, setConsumedItems] = useState<ConsumedItem[]>([]);
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  const [replacedItems, setReplacedItems] = useState<ReplacedItem[]>([]);
  const [damagedItems, setDamagedItems] = useState<DamagedItem[]>([]);
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);

  // Hydrate local tracking state from form values (e.g. resume from localStorage)
  useEffect(() => {
    const initialLaundry = (form.getValues('items_sent_to_laundry') || []) as LaundryItem[];
    const initialConsumed = (form.getValues('items_consumed') || []) as ConsumedItem[];
    const initialLost = (form.getValues('items_lost') || []) as LostItem[];
    const initialReplaced = (form.getValues('items_replaced') || []) as ReplacedItem[];
    const initialDamaged = (form.getValues('items_damaged') || []) as DamagedItem[];

    const initialShortage = ((form.getValues('items_missing') || []) as any[])
      .filter((it) => it?.reason === 'shortage')
      .map((it) => ({
        item_id: it.item_id,
        item_name: it.item_name,
        item_code: it.item_code,
        item_type: (it.item_type || 'linen') as 'linen' | 'consumable' | 'equipment' | 'furniture',
        missing_quantity: Number(it.shortage || 0),
        standard_quantity: Number(it.standard_quantity || 0),
      }))
      .filter((it) => it.item_id && it.missing_quantity > 0);

    setLaundryItems(initialLaundry);
    setConsumedItems(initialConsumed);
    setLostItems(initialLost);
    setReplacedItems(initialReplaced);
    setDamagedItems(initialDamaged);
    setMissingItems(initialShortage as unknown as MissingItem[]);
  }, [form, roomId]);

  // Update form whenever tracked items change
  useEffect(() => {
    form.setValue('items_sent_to_laundry', laundryItems);
    form.setValue('items_consumed', consumedItems);
    form.setValue('items_lost', lostItems);
    form.setValue('items_replaced', replacedItems);
    form.setValue('items_damaged', damagedItems as any);

    // Build items_missing with real shortages
    const replacedQtyMap = replacedItems.reduce<Record<string, number>>((acc, it) => {
      acc[it.item_id] = (acc[it.item_id] || 0) + (it.quantity || 0);
      return acc;
    }, {});

    const laundryMissing = laundryItems
      .map((it) => {
        const replacedQty = replacedQtyMap[it.item_id] || 0;
        const shortage = Math.max(0, (it.quantity || 0) - replacedQty);
        return shortage > 0
          ? {
              item_id: it.item_id,
              item_name: it.item_name,
              item_code: it.item_code,
              shortage,
              reason: 'laundry',
            }
          : null;
      })
      .filter(Boolean) as any[];

    const lostMissing = lostItems.map((it) => ({
      item_id: it.item_id,
      item_name: it.item_name,
      item_code: it.item_code,
      shortage: it.quantity,
      reason: 'lost',
    })) as any[];

    const consumedMissing = consumedItems
      .filter((it) => it.need_refill)
      .map((it) => ({
        item_id: it.item_id,
        item_name: it.item_name,
        item_code: it.item_code,
        shortage: it.quantity,
        reason: 'consumed',
      })) as any[];

    const shortageMissing = missingItems
      .filter(it => it.missing_quantity > 0)
      .map((it) => ({
        item_id: it.item_id,
        item_name: it.item_name,
        item_code: it.item_code,
        shortage: it.missing_quantity,
        reason: 'shortage',
      })) as any[];

    const itemsMissingCalculated = [...laundryMissing, ...lostMissing, ...consumedMissing, ...shortageMissing];
    form.setValue('items_missing', itemsMissingCalculated as any);

    const hasIssues = itemsMissingCalculated.length > 0 || damagedItems.length > 0;
    form.setValue('items_complete', !hasIssues);
  }, [laundryItems, consumedItems, lostItems, replacedItems, damagedItems, missingItems, form]);

  // Handler for Linen status change
  const handleLinenStatusChange = (
    item: RoomItemWithDetails, 
    status: 'ok' | 'laundry' | 'add' | 'change' | 'lost' | 'missing', 
    quantity: number
  ) => {
    if (status === 'laundry') {
      setLaundryItems(prev => [...prev, {
        item_id: item.item_id,
        item_name: item.item_name,
        item_code: item.item_code,
        quantity,
      }]);
    } else if (status === 'add') {
      setReplacedItems(prev => [...prev, {
        item_id: item.item_id,
        item_name: item.item_name,
        item_code: item.item_code,
        quantity,
        from_stock: true,
      }]);
    } else if (status === 'change') {
      setLaundryItems(prev => [...prev, {
        item_id: item.item_id,
        item_name: item.item_name,
        item_code: item.item_code,
        quantity,
      }]);
      setReplacedItems(prev => [...prev, {
        item_id: item.item_id,
        item_name: item.item_name,
        item_code: item.item_code,
        quantity,
        from_stock: true,
      }]);
    } else if (status === 'lost') {
      setLostItems(prev => [...prev, {
        item_id: item.item_id,
        item_name: item.item_name,
        item_code: item.item_code,
        item_type: 'linen',
        quantity,
      }]);
    } else if (status === 'missing') {
      setMissingItems(prev => {
        const existing = prev.find(i => i.item_id === item.item_id);
        if (existing) {
          return prev.map(i => i.item_id === item.item_id 
            ? { ...i, missing_quantity: quantity } 
            : i
          );
        }
        return [...prev, {
          item_id: item.item_id,
          item_name: item.item_name,
          item_code: item.item_code,
          item_type: 'linen',
          missing_quantity: quantity,
          standard_quantity: item.standard_quantity,
        }];
      });
    }
  };

  // Reset linen status
  const resetLinenStatus = (itemId: string) => {
    setLaundryItems(prev => prev.filter(i => i.item_id !== itemId));
    setReplacedItems(prev => prev.filter(i => i.item_id !== itemId));
    setLostItems(prev => prev.filter(i => i.item_type === 'linen' ? i.item_id !== itemId : true));
    setMissingItems(prev => prev.filter(i => i.item_id !== itemId));
  };

  // Handlers for Consumable
  const handleMarkConsumed = (item: RoomItemWithDetails, quantity: number, needRefill: boolean) => {
    setConsumedItems(prev => [...prev, {
      item_id: item.item_id,
      item_name: item.item_name,
      item_code: item.item_code,
      quantity,
      need_refill: needRefill,
    }]);
  };

  // Handlers for Equipment/Furniture
  const handleEquipmentLost = (item: RoomItemWithDetails, quantity: number, estimatedValue?: number) => {
    setLostItems(prev => [...prev, {
      item_id: item.item_id,
      item_name: item.item_name,
      item_code: item.item_code,
      item_type: 'equipment',
      quantity,
      estimated_value: estimatedValue,
    }]);
  };

const handleMarkDamaged = (item: RoomItemWithDetails, damageInfo: { damage_type: 'repairable' | 'replacement_needed'; damage_cost: number; notes?: string; quantity?: number; item_type?: 'linen' | 'consumable' | 'equipment' | 'furniture' }) => {
    setDamagedItems(prev => [...prev, {
      item_id: item.item_id,
      item_name: item.item_name,
      item_code: item.item_code,
      quantity: damageInfo.quantity ?? 1,
      damage_type: damageInfo.damage_type,
      damage_cost: damageInfo.damage_cost,
      notes: damageInfo.notes,
      item_type: damageInfo.item_type || (item as any).item_type,
    }]);
  };

  // Remove handlers
  const removeFromLaundry = (itemId: string) => {
    setLaundryItems(prev => prev.filter(i => i.item_id !== itemId));
  };

  const removeFromLost = (itemId: string) => {
    setLostItems(prev => prev.filter(i => i.item_id !== itemId));
  };

  const removeFromReplaced = (itemId: string) => {
    setReplacedItems(prev => prev.filter(i => i.item_id !== itemId));
  };

  const removeFromConsumed = (itemId: string) => {
    setConsumedItems(prev => prev.filter(i => i.item_id !== itemId));
  };

  const removeFromDamaged = (itemId: string) => {
    setDamagedItems(prev => prev.filter(i => i.item_id !== itemId));
  };

  return (
    <DefaultOkItemsCheck
      items={items}
      checkType={checkType}
      phase={phase}
      laundryItems={laundryItems}
      consumedItems={consumedItems}
      lostItems={lostItems}
      replacedItems={replacedItems}
      damagedItems={damagedItems}
      missingItems={missingItems.map(m => ({ item_id: m.item_id, missing_quantity: m.missing_quantity }))}
      onLinenStatusChange={handleLinenStatusChange}
      onMarkConsumed={handleMarkConsumed}
      onEquipmentLost={handleEquipmentLost}
      onMarkDamaged={handleMarkDamaged}
      onResetLinen={resetLinenStatus}
      onRemoveFromLost={removeFromLost}
      onRemoveFromConsumed={removeFromConsumed}
      onRemoveFromDamaged={removeFromDamaged}
      onPhotosCollected={(newPhotos) => {
        const current = (form.getValues('photos') || []) as string[]
        // Dedupe
        const merged = Array.from(new Set([...current, ...newPhotos]))
        form.setValue('photos', merged, { shouldDirty: true })
      }}
    />
  );
}
