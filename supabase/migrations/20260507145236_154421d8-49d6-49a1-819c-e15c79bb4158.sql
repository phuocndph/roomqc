
ALTER TABLE public.items DISABLE TRIGGER USER;

UPDATE public.items i
SET asset_group = CASE
    WHEN i.item_type = 'linen' THEN 'linen'::public.asset_group
    WHEN i.item_type = 'furniture' THEN 'furniture'::public.asset_group
    WHEN i.item_type = 'consumable' AND i.is_chargeable IS TRUE THEN 'minibar'::public.asset_group
    WHEN i.item_type = 'consumable' THEN 'consumable_free'::public.asset_group
    WHEN i.item_type = 'equipment' AND COALESCE(i.unit_price,0) >= 1000000 THEN 'equipment_large'::public.asset_group
    WHEN i.item_type = 'equipment' THEN 'electronic_accessory'::public.asset_group
    ELSE NULL
  END,
  migration_review_required = (i.item_type = 'equipment'),
  migration_review_reason = CASE WHEN i.item_type='equipment' THEN 'equipment_needs_manager_review' ELSE NULL END,
  updated_at = now()
WHERE i.asset_group IS NULL;

ALTER TABLE public.items ENABLE TRIGGER USER;
