-- Phase 1: Add delivery_confirmation task_type and link to distribution_order_room

-- 1. Update task_type constraint to include 'delivery_confirmation'
ALTER TABLE public.housekeeping_tasks 
DROP CONSTRAINT IF EXISTS housekeeping_tasks_task_type_check;

ALTER TABLE public.housekeeping_tasks 
ADD CONSTRAINT housekeeping_tasks_task_type_check 
CHECK (task_type IN ('checkout_inspection', 'cleaning', 'checkin_prep', 'amenity_request', 'delivery_confirmation', 'other'));

-- 2. Add column to link task with distribution_order_room for delivery confirmation workflow
ALTER TABLE public.housekeeping_tasks 
ADD COLUMN IF NOT EXISTS distribution_order_room_id UUID REFERENCES public.distribution_order_rooms(id) ON DELETE SET NULL;

-- 3. Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_distribution_order_room_id 
ON public.housekeeping_tasks(distribution_order_room_id) 
WHERE distribution_order_room_id IS NOT NULL;

-- 4. Add trigger type for delivery workflow
COMMENT ON COLUMN public.housekeeping_tasks.distribution_order_room_id IS 'Links delivery_confirmation tasks to their source distribution order room';