import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCorsHeaders } from '../_shared/cors.ts'
import { requireCronAuth } from '../_shared/cronAuth.ts'
interface WorkflowTrigger {
  trigger_type: string
  event_data: Record<string, any>
  tenant_id: string
  hotel_id?: string
}

interface WorkflowAction {
  type: string
  config: Record<string, any>
}

interface Workflow {
  id: string
  name: string
  trigger_type: string
  conditions: Record<string, any>[]
  status: string
}

// Whitelist of tables that the `update_record` action may write to.
// Anything outside this list is rejected to prevent arbitrary writes via the service role.
const UPDATE_RECORD_TABLE_WHITELIST = new Set<string>([
  'room_bookings',
  'rooms',
  'housekeeping_tasks',
  'maintenance_requests',
  'in_app_notifications',
])

const WORKFLOW_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A browser event is a lookup hint. The source command mints the delivery
// witness; the caller's JWT, current authority and all effects are checked in
// the database transaction. Service credentials never substitute for the user.
async function executeDeliveryWorkflow(
  req: Request,
  payload: WorkflowTrigger,
  supabaseUrl: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
  const authorization = req.headers.get('authorization')
  if (!authorization || authorization.length > 8192 || !/^Bearer\s+\S+$/i.test(authorization)) {
    return reply(401, { success: false, code: 'WORKFLOW_SESSION_REQUIRED', error: 'Vui lòng đăng nhập lại.' })
  }
  const stopId = payload.event_data?.room_order_id
  if (typeof stopId !== 'string' || !WORKFLOW_UUID.test(stopId)
    || typeof payload.tenant_id !== 'string' || !WORKFLOW_UUID.test(payload.tenant_id)
    || (payload.hotel_id !== undefined && !WORKFLOW_UUID.test(payload.hotel_id))) {
    return reply(400, { success: false, code: 'WORKFLOW_SOURCE_INVALID', error: 'Thông tin phiếu giao hàng không hợp lệ.' })
  }
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!anonKey) {
    return reply(503, { success: false, code: 'WORKFLOW_UNAVAILABLE', error: 'Chưa thể xử lý tác vụ. Vui lòng thử lại.' })
  }
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await caller.rpc('complete_delivery_workflow', {
    p_stop_id: stopId, p_tenant_id: payload.tenant_id, p_hotel_id: payload.hotel_id ?? null,
  })
  if (error) {
    if (error.code === 'PGRST301' || error.code === 'PGRST303') {
      return reply(401, { success: false, code: 'WORKFLOW_SESSION_REQUIRED', error: 'Vui lòng đăng nhập lại.' })
    }
    if (error.code === '42501') {
      return reply(403, { success: false, code: 'WORKFLOW_NOT_ALLOWED', error: 'Tài khoản hiện tại không được xử lý phiếu này.' })
    }
    if (error.code === '22023' || error.code === '22P02') {
      return reply(400, { success: false, code: 'WORKFLOW_SOURCE_INVALID', error: 'Phiếu giao hàng chưa hoàn tất hoặc không hợp lệ.' })
    }
    if (error.code === 'PT409') {
      const legacy = error.message === 'WORKFLOW_SOURCE_REQUIRES_REVIEW'
      return reply(409, { success: false, code: legacy ? 'WORKFLOW_SOURCE_REQUIRES_REVIEW' : 'WORKFLOW_REQUIRES_REVIEW',
        error: 'Tác vụ cần được kiểm tra trước khi tiếp tục.' })
    }
    // A failed response does not prove rollback. Retrying this same source
    // reads its durable result instead of creating a second task.
    return reply(503, { success: false, code: 'WORKFLOW_RESULT_UNKNOWN', error: 'Chưa xác nhận được kết quả. Vui lòng thử lại với cùng phiếu.' })
  }
  if (data?.success !== true || typeof data?.task_id !== 'string') {
    return reply(503, { success: false, code: 'WORKFLOW_RESULT_UNKNOWN', error: 'Chưa xác nhận được kết quả. Vui lòng thử lại với cùng phiếu.' })
  }
  return reply(200, data)
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, code: 'WORKFLOW_METHOD_NOT_ALLOWED' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    let payload: WorkflowTrigger
    try {
      payload = await req.json()
    } catch {
      return new Response(JSON.stringify({ success: false, code: 'WORKFLOW_PAYLOAD_INVALID' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return new Response(JSON.stringify({ success: false, code: 'WORKFLOW_PAYLOAD_INVALID' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { trigger_type, event_data, tenant_id, hotel_id } = payload

    if (trigger_type === 'delivery_stop_completed') {
      try {
        return await executeDeliveryWorkflow(req, payload, supabaseUrl, corsHeaders)
      } catch {
        return new Response(JSON.stringify({ success: false, code: 'WORKFLOW_RESULT_UNKNOWN',
          error: 'Chưa xác nhận được kết quả. Vui lòng thử lại với cùng phiếu.' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        })
      }
    }

    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ---- AuthZ ------------------------------------------------------------
    // Allow either (a) cron / service-role internal callers, or
    // (b) an authenticated user whose tenant matches the supplied tenant_id.
    const cronDenied = requireCronAuth(req, corsHeaders)
    if (cronDenied) {
      const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      const token = authHeader.replace(/^Bearer\s+/i, '')
      const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token)
      if (claimsErr || !claims?.claims?.sub) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      const userId = claims.claims.sub
      const { data: userRow } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', userId)
        .maybeSingle()
      if (!userRow || userRow.tenant_id !== tenant_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden: tenant mismatch' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    console.log(`[execute-workflow] Received trigger: ${trigger_type}`, { event_data, tenant_id, hotel_id })

    if (!trigger_type || !tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing trigger_type or tenant_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }


    // Fetch active workflows matching the trigger type
    const { data: workflows, error: workflowError } = await supabase
      .from('workflows')
      .select(`
        id,
        name,
        trigger_type,
        conditions,
        status,
        workflow_actions (
          id,
          action_type,
          action_config,
          order_index
        )
      `)
      .eq('tenant_id', tenant_id)
      .eq('trigger_type', trigger_type)
      .eq('status', 'active')

    if (workflowError) {
      console.error('[execute-workflow] Error fetching workflows:', workflowError)
      throw workflowError
    }

    if (!workflows || workflows.length === 0) {
      console.log(`[execute-workflow] No active workflows found for trigger: ${trigger_type}`)
      
      return new Response(
        JSON.stringify({ success: true, message: 'No matching workflows', executed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[execute-workflow] Found ${workflows.length} matching workflows`)

    let executedCount = 0
    const results: any[] = []

    for (const workflow of workflows) {
      try {
        // Check if conditions match
        const conditionsMatch = checkConditions(workflow.conditions || [], event_data)
        
        if (!conditionsMatch) {
          console.log(`[execute-workflow] Workflow ${workflow.name} conditions not met, skipping`)
          continue
        }

        console.log(`[execute-workflow] Executing workflow: ${workflow.name}`)

        // Sort actions by order_index
        const actions = (workflow.workflow_actions || []).sort(
          (a: any, b: any) => (a.order_index || 0) - (b.order_index || 0)
        )

        const actionResults: any[] = []

        // Execute each action
        for (const action of actions) {
          const actionResult = await executeAction(
            supabase,
            action.action_type,
            action.action_config,
            event_data,
            tenant_id,
            hotel_id
          )
          actionResults.push({
            action_type: action.action_type,
            success: actionResult.success,
            error: actionResult.error,
          })
        }

        // Log execution
        await supabase.from('workflow_executions').insert({
          workflow_id: workflow.id,
          trigger_data: event_data,
          started_at: new Date().toISOString(),
          status: actionResults.every(r => r.success) ? 'success' : 'partial',
          execution_log: { actions: actionResults },
        })

        // Update workflow statistics
        await supabase.rpc('increment_workflow_stats', {
          p_workflow_id: workflow.id,
          p_success: actionResults.every(r => r.success),
        })

        executedCount++
        results.push({
          workflow_id: workflow.id,
          workflow_name: workflow.name,
          actions_executed: actionResults.length,
          success: actionResults.every(r => r.success),
        })

      } catch (workflowError) {
        console.error(`[execute-workflow] Error executing workflow ${workflow.name}:`, workflowError)
        
        // Log failed execution
        await supabase.from('workflow_executions').insert({
          workflow_id: workflow.id,
          trigger_data: event_data,
          started_at: new Date().toISOString(),
          status: 'failed',
          execution_log: { error: String(workflowError) },
        })

        results.push({
          workflow_id: workflow.id,
          workflow_name: workflow.name,
          success: false,
          error: String(workflowError),
        })
      }
    }

    console.log(`[execute-workflow] Completed. Executed ${executedCount}/${workflows.length} workflows`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        executed: executedCount,
        total: workflows.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[execute-workflow] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Check if all conditions match the event data
 */
function checkConditions(conditions: Record<string, any>[], eventData: Record<string, any>): boolean {
  if (!conditions || conditions.length === 0) return true

  for (const condition of conditions) {
    const { field, operator, value } = condition
    const eventValue = getNestedValue(eventData, field)

    switch (operator) {
      case 'equals':
        if (eventValue !== value) return false
        break
      case 'not_equals':
        if (eventValue === value) return false
        break
      case 'contains':
        if (!String(eventValue).includes(String(value))) return false
        break
      case 'greater_than':
        if (Number(eventValue) <= Number(value)) return false
        break
      case 'less_than':
        if (Number(eventValue) >= Number(value)) return false
        break
      case 'is_true':
        if (!eventValue) return false
        break
      case 'is_false':
        if (eventValue) return false
        break
      case 'in':
        if (!Array.isArray(value) || !value.includes(eventValue)) return false
        break
      default:
        console.warn(`Unknown operator: ${operator}`)
    }
  }

  return true
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

/**
 * Replace template variables in a string
 */
function replaceVariables(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    const value = getNestedValue(data, path)
    return value !== undefined ? String(value) : match
  })
}

/**
 * Execute a single workflow action
 */
async function executeAction(
  supabase: any,
  actionType: string,
  config: Record<string, any>,
  eventData: Record<string, any>,
  tenantId: string,
  hotelId?: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[execute-workflow] Executing action: ${actionType}`, config)

  try {
    switch (actionType) {
      case 'send_notification': {
        const notificationType = config.notification_type || 'in_app'
        
        if (notificationType === 'telegram') {
          // Call send-telegram-notification function
          const telegramConfig = config.telegram_config || {}
          const message = replaceVariables(telegramConfig.message || '', eventData)
          const title = replaceVariables(telegramConfig.title || '', eventData)
          
          const { error } = await supabase.functions.invoke('send-telegram-notification', {
            body: {
              tenant_id: tenantId,
              hotel_id: hotelId,
              title,
              message,
              department: telegramConfig.department,
              group_levels: telegramConfig.group_levels,
              group_ids: telegramConfig.group_ids,
            },
          })
          
          if (error) throw error
        } else if (notificationType === 'email') {
          // Call send-notification-email function
          const { error } = await supabase.functions.invoke('send-notification-email', {
            body: {
              tenant_id: tenantId,
              to_email: config.recipient_email,
              subject: replaceVariables(config.subject || '', eventData),
              body_html: replaceVariables(config.body || '', eventData),
            },
          })
          
          if (error) throw error
        } else {
          // In-app notification
          const recipientIds = config.recipient_ids || []
          const title = replaceVariables(config.title || '', eventData)
          const body = replaceVariables(config.body || '', eventData)
          
          for (const userId of recipientIds) {
            await supabase.from('in_app_notifications').insert({
              tenant_id: tenantId,
              user_id: userId,
              title,
              body,
              type: config.notification_level || 'info',
              action_url: config.action_url,
              metadata: eventData,
            })
          }
        }
        
        return { success: true }
      }

      case 'create_housekeeping_task': {
        // Validate required data
        const roomId = eventData.room_id
        const taskHotelId = hotelId || eventData.hotel_id
        
        if (!roomId) {
          console.log('[execute-workflow] create_housekeeping_task: No room_id in event data, skipping')
          return { success: false, error: 'No room_id in event data' }
        }
        
        if (!taskHotelId) {
          console.log('[execute-workflow] create_housekeeping_task: No hotel_id available, skipping')
          return { success: false, error: 'No hotel_id available' }
        }
        
        // Determine priority
        let priority = config.priority || 'medium'
        if (config.priority_mode === 'auto' && eventData.priority) {
          priority = eventData.priority
        }
        
        // Build title
        const title = config.title_template 
          ? replaceVariables(config.title_template, eventData)
          : `${getTaskTypeLabel(config.task_type || 'cleaning')} - P.${eventData.room_number || 'N/A'}`
        
        // Build description
        const description = config.description_template
          ? replaceVariables(config.description_template, eventData)
          : null
        
        // Calculate due_at
        const dueAtOffset = config.due_at_offset || 30 // minutes
        const dueAt = new Date(Date.now() + dueAtOffset * 60 * 1000).toISOString()
        
        // Determine assignment (auto_rotate, by_floor, or specific)
        let assignedTo: string | null = null
        
        if (config.assignment_mode === 'specific' && eventData.assigned_to) {
          assignedTo = eventData.assigned_to
        } else if (config.assignment_mode === 'by_floor' || config.assignment_mode === 'auto_rotate') {
          // Try to find an available staff member
          const floor = eventData.floor
          
          // Get housekeeping staff for this hotel
          const { data: staffList } = await supabase
            .from('user_hotels')
            .select('user_id, users!inner(id, full_name, user_level_code)')
            .eq('hotel_id', taskHotelId)
            .eq('users.user_level_code', 'staff')
          
          if (staffList && staffList.length > 0) {
            if (config.assignment_mode === 'by_floor' && floor) {
              // Try to find staff assigned to this floor (could add floor assignment logic later)
              // For now, use round-robin
            }
            
            // Round-robin: Get the staff with least pending tasks
            const staffIds = staffList.map((s: any) => s.user_id)
            
            const { data: taskCounts } = await supabase
              .from('housekeeping_tasks')
              .select('assigned_to')
              .in('assigned_to', staffIds)
              .in('status', ['pending', 'in_progress'])
            
            // Count tasks per staff
            const counts: Record<string, number> = {}
            staffIds.forEach((id: string) => counts[id] = 0)
            taskCounts?.forEach((t: any) => {
              if (t.assigned_to) counts[t.assigned_to] = (counts[t.assigned_to] || 0) + 1
            })
            
            // Find staff with minimum tasks
            let minTasks = Infinity
            staffIds.forEach((id: string) => {
              if (counts[id] < minTasks) {
                minTasks = counts[id]
                assignedTo = id
              }
            })
          }
        }
        
        // Insert the task
        const { data: newTask, error: insertError } = await supabase
          .from('housekeeping_tasks')
          .insert({
            tenant_id: tenantId,
            hotel_id: taskHotelId,
            room_id: roomId,
            booking_id: eventData.booking_id || null,
            task_type: config.task_type || 'cleaning',
            title,
            description,
            priority,
            assigned_to: assignedTo,
            due_at: dueAt,
            status: 'pending',
          })
          .select()
          .single()
        
        if (insertError) {
          console.error('[execute-workflow] Failed to create housekeeping task:', insertError)
          throw insertError
        }
        
        console.log(`[execute-workflow] Created housekeeping task: ${newTask.id}`)
        
        // Optionally send notification to assigned staff
        if (config.send_notification && assignedTo) {
          await supabase.functions.invoke('send-push-notification', {
            body: {
              tenant_id: tenantId,
              user_id: assignedTo,
              title: `🧹 Công việc mới - P.${eventData.room_number || 'N/A'}`,
              body: title,
              data: {
                type: 'housekeeping_task',
                task_id: newTask.id,
                room_id: roomId,
              },
            },
          })
        }
        
        return { success: true }
      }

      case 'create_maintenance': {
        const title = replaceVariables(config.title || 'Yêu cầu bảo trì', eventData)
        const description = replaceVariables(config.description || '', eventData)
        
        await supabase.from('maintenance_requests').insert({
          tenant_id: tenantId,
          hotel_id: hotelId || eventData.hotel_id,
          room_id: eventData.room_id,
          title,
          description,
          priority: config.priority || 'medium',
          category_id: config.category_id,
          status: 'waiting',
        })
        
        return { success: true }
      }

      case 'update_record': {
        const table = config.table
        const recordId = config.record_id || eventData.id || eventData.record_id
        const updates: Record<string, any> = {}
        
        for (const field of config.fields || []) {
          if (field.mode === 'fixed') {
            updates[field.name] = field.value
          } else if (field.mode === 'increment') {
            // Would need RPC for atomic increment
            updates[field.name] = field.increment
          } else if (field.mode === 'variable') {
            updates[field.name] = getNestedValue(eventData, field.variable)
          }
        }
        
        if (table && recordId && Object.keys(updates).length > 0) {
          if (!UPDATE_RECORD_TABLE_WHITELIST.has(String(table))) {
            console.warn(`[execute-workflow] update_record rejected: table '${table}' not in whitelist`)
            return { success: false, error: `Table '${table}' not allowed for update_record` }
          }
          const { error } = await supabase
            .from(table)
            .update(updates)
            .eq('id', recordId)
            .eq('tenant_id', tenantId)

          if (error) throw error
        }
        
        return { success: true }
      }

      case 'create_log': {
        await supabase.from('activity_logs').insert({
          tenant_id: tenantId,
          entity_type: config.entity_type || 'workflow',
          entity_id: eventData.id,
          action: config.action || 'workflow_triggered',
          description: replaceVariables(config.description || '', eventData),
          user_name: 'System (Workflow)',
        })
        
        return { success: true }
      }

      default:
        console.warn(`[execute-workflow] Unknown action type: ${actionType}`)
        return { success: false, error: `Unknown action type: ${actionType}` }
    }
  } catch (error) {
    console.error(`[execute-workflow] Action ${actionType} failed:`, error)
    return { success: false, error: String(error) }
  }
}

/**
 * Helper function to get task type label
 */
function getTaskTypeLabel(taskType: string): string {
  const labels: Record<string, string> = {
    checkout_inspection: 'Kiểm tra checkout',
    cleaning: 'Dọn phòng',
    checkin_prep: 'Chuẩn bị check-in',
    amenity_request: 'Bổ sung đồ dùng',
    delivery_confirmation: 'Xác nhận nhận hàng',
    other: 'Công việc khác',
  }
  return labels[taskType] || taskType
}
