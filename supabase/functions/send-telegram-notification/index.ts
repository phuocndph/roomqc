import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildCorsHeaders } from '../_shared/cors.ts'
import { getBearerToken, isInternalRequest } from '../_shared/internalAuth.ts'

interface TelegramPayload {
  tenant_id: string
  hotel_id?: string // Filter groups by specific hotel
  user_ids?: string[]
  group_ids?: string[]
  send_to_all_groups?: boolean
  send_to_owner_groups?: boolean
  send_to_management_groups?: boolean
  send_to_staff_groups?: boolean
  // NEW: Department-based routing
  department?: string // housekeeping, maintenance, laundry, inventory, accounting, front_desk, general
  notification_type_filter?: string // checkout, checkin, maintenance_new, etc.
  title: string
  message: string
  notification_type?: 'booking' | 'checkin' | 'checkout' | 'maintenance' | 'inventory' | 'payment' | 'laundry' | 'system'
  action_url?: string
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: string = 'HTML'
): Promise<{ success: boolean; error?: string; chatId: string }> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: parseMode,
          disable_web_page_preview: true,
        }),
      }
    )
    
    const result = await response.json()
    
    if (!result.ok) {
      console.error(`Telegram error for chat ${chatId}:`, result.description)
      return { success: false, error: result.description, chatId }
    }
    
    console.log(`Message sent successfully to chat ${chatId}`)
    return { success: true, chatId }
  } catch (error) {
    console.error(`Send error for chat ${chatId}:`, error)
    return { success: false, error: String(error), chatId }
  }
}

function escapeTelegramHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN not configured')
      return new Response(
        JSON.stringify({ success: false, error: 'Telegram bot not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // This function intentionally keeps verify_jwt=false because trusted
    // functions and database jobs use a private header. Browser calls still
    // need a valid user JWT and a tenant membership check below.
    const internal = isInternalRequest(req)
    let callerId: string | null = null
    if (!internal) {
      const token = getBearerToken(req)
      if (!token) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: authData, error: authError } = await supabase.auth.getUser(token)
      if (authError || !authData.user) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      callerId = authData.user.id
    }
    
    const payload: TelegramPayload = await req.json()
    console.log('Received payload:', JSON.stringify(payload, null, 2))
    
    if (!payload.tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!payload.title?.trim() || !payload.message?.trim() || payload.title.length > 200 || payload.message.length > 4000) {
      return new Response(
        JSON.stringify({ success: false, error: 'title/message không hợp lệ' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (callerId) {
      const { data: caller } = await supabase
        .from('users')
        .select('tenant_id, status')
        .eq('id', callerId)
        .maybeSingle()
      if (!caller || caller.status !== 'active' || caller.tenant_id !== payload.tenant_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const { data: tenantUsers } = payload.user_ids?.length
      ? await supabase.from('users').select('id').eq('tenant_id', payload.tenant_id).in('id', payload.user_ids)
      : { data: [] as { id: string }[] }
    const tenantUserIds = (tenantUsers ?? []).map((row) => row.id)
    
    const chatIds: string[] = []
    
    // 1. Lấy chat_id từ user_ids (cá nhân)
    if (payload.user_ids?.length) {
      console.log('Fetching connections for users:', payload.user_ids)
      const { data: userConnections, error: ucError } = await supabase
        .from('telegram_connections')
        .select('chat_id')
        .in('user_id', tenantUserIds)
        .eq('is_active', true)
      
      if (ucError) {
        console.error('Error fetching user connections:', ucError)
      } else {
        chatIds.push(...(userConnections || []).map(c => c.chat_id))
        console.log(`Found ${userConnections?.length || 0} user connections`)
      }
    }
    
    // 2. Lấy chat_id từ group_ids cụ thể
    if (payload.group_ids?.length) {
      console.log('Fetching specific groups:', payload.group_ids)
      const { data: groups, error: gError } = await supabase
        .from('telegram_groups')
        .select('chat_id')
        .in('id', payload.group_ids)
        .eq('tenant_id', payload.tenant_id)
        .eq('is_active', true)
      
      if (gError) {
        console.error('Error fetching groups:', gError)
      } else {
        chatIds.push(...(groups || []).map(g => g.chat_id))
        console.log(`Found ${groups?.length || 0} specific groups`)
      }
    }
    
    // Helper to build query with optional hotel_id, department, and notification_type filter
    const buildGroupQuery = (groupTypes?: string[]) => {
      let query = supabase
        .from('telegram_groups')
        .select('chat_id, notification_types')
        .eq('tenant_id', payload.tenant_id)
        .eq('is_active', true)
      
      // If hotel_id is specified, filter by hotel OR groups without hotel (tenant-wide)
      if (payload.hotel_id) {
        query = query.or(`hotel_id.eq.${payload.hotel_id},hotel_id.is.null`)
      }
      
      // NEW: Filter by department
      if (payload.department) {
        // Include groups with matching department OR groups without department (general)
        query = query.or(`department.eq.${payload.department},department.is.null`)
      }
      
      if (groupTypes?.length) {
        query = query.in('group_type', groupTypes)
      }
      
      return query
    }

    // Helper to filter by notification_type
    const filterByNotificationType = (groups: { chat_id: string; notification_types: string[] | null }[] | null): string[] => {
      if (!groups) return []
      
      console.log(`Filtering ${groups.length} groups by notification_type: ${payload.notification_type_filter || 'none'}`)
      
      // If notification_type_filter is specified, filter groups that accept this type
      if (payload.notification_type_filter) {
        const filtered = groups.filter(g => {
          // Groups with null/empty notification_types accept all types
          if (!g.notification_types || g.notification_types.length === 0) {
            console.log(`  - Group ${g.chat_id}: PASS (no filter set)`)
            return true
          }
          
          // Groups with 'all' accept all notification types
          if (g.notification_types.includes('all')) {
            console.log(`  - Group ${g.chat_id}: PASS (has 'all')`)
            return true
          }
          
          // Otherwise, check if specific type is in the list
          const hasType = g.notification_types.includes(payload.notification_type_filter!)
          console.log(`  - Group ${g.chat_id}: ${hasType ? 'PASS' : 'SKIP'} (types: ${g.notification_types.join(', ')})`)
          return hasType
        })
        
        console.log(`Filtered result: ${filtered.length}/${groups.length} groups passed`)
        return filtered.map(g => g.chat_id)
      }
      
      return groups.map(g => g.chat_id)
    }
    
    // 3. Gửi cho tất cả nhóm của tenant (hoặc hotel/department cụ thể)
    if (payload.send_to_all_groups) {
      console.log('Fetching all groups for tenant:', payload.tenant_id, 
        payload.hotel_id ? `hotel: ${payload.hotel_id}` : '',
        payload.department ? `department: ${payload.department}` : '')
      const { data: allGroups, error: agError } = await buildGroupQuery()
      
      if (agError) {
        console.error('Error fetching all groups:', agError)
      } else {
        const filteredChatIds = filterByNotificationType(allGroups)
        chatIds.push(...filteredChatIds)
        console.log(`Found ${filteredChatIds.length} tenant groups after filtering`)
      }
    }
    
    // 4. Gửi cho nhóm owner
    if (payload.send_to_owner_groups) {
      const { data: ownerGroups } = await buildGroupQuery(['owner'])
      const filteredChatIds = filterByNotificationType(ownerGroups)
      chatIds.push(...filteredChatIds)
    }
    
    // 5. Gửi cho nhóm management
    if (payload.send_to_management_groups) {
      const { data: mgmtGroups } = await buildGroupQuery(['owner', 'management'])
      const filteredChatIds = filterByNotificationType(mgmtGroups)
      chatIds.push(...filteredChatIds)
    }
    
    // 6. Gửi cho nhóm staff
    if (payload.send_to_staff_groups) {
      const { data: staffGroups } = await buildGroupQuery(['staff', 'general'])
      const filteredChatIds = filterByNotificationType(staffGroups)
      chatIds.push(...filteredChatIds)
    }

    // 7. NEW: Gửi theo department nếu không có flag nào khác
    if (payload.department && !payload.send_to_all_groups && !payload.send_to_owner_groups && 
        !payload.send_to_management_groups && !payload.send_to_staff_groups) {
      console.log('Fetching groups by department:', payload.department)
      const { data: deptGroups, error: deptError } = await buildGroupQuery()
      
      if (deptError) {
        console.error('Error fetching department groups:', deptError)
      } else {
        const filteredChatIds = filterByNotificationType(deptGroups)
        chatIds.push(...filteredChatIds)
        console.log(`Found ${filteredChatIds.length} department groups`)
      }
    }
    
    // Remove duplicates
    const uniqueChatIds = [...new Set(chatIds)]
    console.log(`Total unique chat IDs to send: ${uniqueChatIds.length}`)
    
    if (uniqueChatIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, total: 0, message: 'No recipients found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Format message với emoji theo loại
    const emojiMap: Record<string, string> = {
      booking: '🏨',
      checkin: '✅',
      checkout: '🚪',
      maintenance: '🔧',
      inventory: '📦',
      payment: '💰',
      laundry: '🧺',
      system: '⚙️',
    }
    
    const icon = emojiMap[payload.notification_type || ''] || '🔔'
    
    let formattedMessage = `${icon} <b>${escapeTelegramHtml(payload.title)}</b>\n\n${escapeTelegramHtml(payload.message)}`

    if (payload.action_url) {
      try {
        const baseUrl = Deno.env.get('ROOMQC_PUBLIC_URL') || 'https://roomqc.com'
        const actionUrl = new URL(payload.action_url, baseUrl)
        if (actionUrl.protocol === 'https:' && actionUrl.origin === new URL(baseUrl).origin) {
          formattedMessage += `\n\n🔗 <a href="${actionUrl.toString()}">Xem chi tiết</a>`
        }
      } catch {
        // Ignore malformed links; the notification itself is still useful.
      }
    }
    
    // Gửi tin nhắn song song
    const results = await Promise.all(
      uniqueChatIds.map(chatId => 
        sendTelegramMessage(botToken, chatId, formattedMessage)
      )
    )
    
    const successCount = results.filter(r => r.success).length
    const failedChats = results.filter(r => !r.success)
    
    if (failedChats.length > 0) {
      console.log('Failed chats:', failedChats)
    }
    
    console.log(`Sent ${successCount}/${uniqueChatIds.length} messages successfully`)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successCount, 
        total: uniqueChatIds.length,
        failed: failedChats.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in send-telegram-notification:', error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
