import { supabase } from '@/integrations/supabase/client'

interface TriggerWorkflowParams {
  triggerType: string
  eventData: Record<string, any>
  tenantId: string
  hotelId?: string
}

/**
 * Trigger workflow execution for a specific event
 * This calls the execute-workflow edge function
 * 
 * @example
 * await triggerWorkflow({
 *   triggerType: 'room_status_change',
 *   eventData: { room_id: '...', old_status: 'occupied', new_status: 'checkout' },
 *   tenantId: '...',
 *   hotelId: '...'
 * })
 */
export async function triggerWorkflow({
  triggerType,
  eventData,
  tenantId,
  hotelId,
}: TriggerWorkflowParams): Promise<{ success: boolean; executed?: number; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('execute-workflow', {
      body: {
        trigger_type: triggerType,
        event_data: eventData,
        tenant_id: tenantId,
        hotel_id: hotelId,
      },
    })

    if (error) {
      console.error('[triggerWorkflow] Error:', error)
      return { success: false, error: error.message }
    }

    return {
      success: data?.success ?? true,
      executed: data?.executed ?? 0,
    }
  } catch (err) {
    console.error('[triggerWorkflow] Exception:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * Common workflow trigger types
 */
export const WorkflowTriggerTypes = {
  // Room events
  ROOM_STATUS_CHANGE: 'room_status_change',
  ROOM_CHECK_COMPLETED: 'room_check_completed',
  ROOM_STANDARDS_APPLIED: 'room_standards_applied',
  
  // Inventory events
  INVENTORY_LOW_STOCK: 'inventory_low_stock',
  INVENTORY_TRANSACTION: 'inventory_transaction',
  
  // Stock Adjustment events
  ADJUSTMENT_CREATED: 'adjustment_created',
  ADJUSTMENT_STARTED: 'adjustment_started',
  ADJUSTMENT_COMPLETED: 'adjustment_completed',
  ADJUSTMENT_APPROVED: 'adjustment_approved',
  ADJUSTMENT_REJECTED: 'adjustment_rejected',
  
  // Maintenance events
  MAINTENANCE_REQUEST_CREATED: 'maintenance_request_created',
  MAINTENANCE_STATUS_CHANGE: 'maintenance_status_change',
  
  // Laundry events
  LAUNDRY_BATCH_STATUS_CHANGE: 'laundry_batch_status_change',
  
  // Housekeeping Task events
  HOUSEKEEPING_TASK_CREATED: 'housekeeping_task_created',
  HOUSEKEEPING_TASK_STARTED: 'housekeeping_task_started',
  HOUSEKEEPING_TASK_COMPLETED: 'housekeeping_task_completed',
  HOUSEKEEPING_TASK_OVERDUE: 'housekeeping_task_overdue',
  
  // Delivery events
  DELIVERY_STOP_COMPLETED: 'delivery_stop_completed',
  
  // Scheduled events
  DAILY_INVENTORY_REPORT: 'daily_inventory_report',
  DAILY_ROOM_STATUS_REPORT: 'daily_room_status_report',
} as const

export type WorkflowTriggerType = typeof WorkflowTriggerTypes[keyof typeof WorkflowTriggerTypes]
