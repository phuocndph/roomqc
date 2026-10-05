import { Hono } from 'https://deno.land/x/hono@v3.4.1/mod.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildCorsHeaders } from '../_shared/cors.ts'

const app = new Hono()

interface ChargeableNotificationPayload {
  tenant_id: string
  hotel_id: string
  booking_id: string
  room_id: string
  room_number: string
  items: {
    name: string
    quantity: number
    total: number
  }[]
  total_amount: number
  recorded_by_name?: string
  // Lost/damaged items for Phase 1 notification
  lost_items?: {
    name: string
    quantity: number
    estimated_value: number
  }[]
  damaged_items?: {
    name: string
    quantity: number
    damage_cost: number
    damage_type: string
  }[]
  lost_total?: number
  damaged_total?: number
}

app.options('*', (c) => {
  return c.json({}, { headers: buildCorsHeaders(c.req.raw) })
})

app.post('/', async (c) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Require authenticated caller whose tenant matches the supplied tenant_id.
    const authHeader = c.req.header('Authorization') ?? c.req.header('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, { status: 401, headers: buildCorsHeaders(c.req.raw) })
    }
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, { status: 401, headers: buildCorsHeaders(c.req.raw) })
    }

    const payload: ChargeableNotificationPayload = await c.req.json()
    const { tenant_id, hotel_id, booking_id, room_id, room_number, items, total_amount, recorded_by_name, lost_items, damaged_items, lost_total, damaged_total } = payload

    // Verify caller belongs to the supplied tenant
    const { data: callerRow } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!callerRow || callerRow.tenant_id !== tenant_id) {
      return c.json({ error: 'Forbidden: tenant mismatch' }, { status: 403, headers: buildCorsHeaders(c.req.raw) })
    }


    // Allow notification if there are items OR lost/damaged items
    const hasChargeableItems = items && items.length > 0
    const hasLostItems = lost_items && lost_items.length > 0
    const hasDamagedItems = damaged_items && damaged_items.length > 0
    
    if (!tenant_id || !hotel_id || (!hasChargeableItems && !hasLostItems && !hasDamagedItems)) {
      return c.json({ error: 'Missing required fields or no items to notify' }, { status: 400, headers: buildCorsHeaders(c.req.raw) })
    }

    // Format message
    let message = `📋 Phòng ${room_number} - Báo cáo checkout\n`
    
    // Add chargeable items if any
    if (hasChargeableItems) {
      const itemsList = items.map(i => `  • ${i.quantity}x ${i.name}: ${formatCurrency(i.total)}`).join('\n')
      message += `\n📦 <b>Phụ thu minibar:</b>\n${itemsList}\n  💰 Tổng: ${formatCurrency(total_amount)}`
    }
    
    // Add lost items if any
    if (hasLostItems) {
      const lostList = lost_items!.map(i => `  • ${i.quantity}x ${i.name}: ${formatCurrency(i.estimated_value)}`).join('\n')
      message += `\n\n🚨 <b>Đồ mất:</b>\n${lostList}\n  💰 Tổng: ${formatCurrency(lost_total || 0)}`
    }
    
    // Add damaged items if any
    if (hasDamagedItems) {
      const damagedList = damaged_items!.map(i => `  • ${i.quantity}x ${i.name} (${i.damage_type === 'repairable' ? 'sửa được' : 'cần thay'}): ${formatCurrency(i.damage_cost)}`).join('\n')
      message += `\n\n⚠️ <b>Đồ hỏng:</b>\n${damagedList}\n  💰 Tổng: ${formatCurrency(damaged_total || 0)}`
    }
    
    // Add grand total and recorder
    const grandTotal = (total_amount || 0) + (lost_total || 0) + (damaged_total || 0)
    if (grandTotal > 0) {
      message += `\n\n💵 <b>TỔNG CỘNG: ${formatCurrency(grandTotal)}</b>`
    }
    if (recorded_by_name) {
      message += `\n👤 Ghi nhận: ${recorded_by_name}`
    }

    // Get users to notify (receptionists and managers at this hotel)
    const { data: usersToNotify } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('tenant_id', tenant_id)
      .eq('status', 'active')
      .or(`user_level_code.in.(tenant_owner,manager),id.in.(
        select user_id from user_hotels where hotel_id = '${hotel_id}'
      )`)

    if (!usersToNotify || usersToNotify.length === 0) {
      console.log('No users to notify')
      return c.json({ success: true, notified: 0 }, { headers: buildCorsHeaders(c.req.raw) })
    }

    // Create in-app notifications
    const notifications = usersToNotify.map(user => ({
      tenant_id,
      user_id: user.id,
      type: 'chargeable_consumption',
      title: `Phụ thu Phòng ${room_number}`,
      message: `${items.length} sản phẩm - ${formatCurrency(total_amount)}`,
      data: {
        booking_id,
        room_id,
        room_number,
        items,
        total_amount,
      },
      is_read: false,
    }))

    const { error: notifError } = await supabase
      .from('notifications')
      .insert(notifications)

    if (notifError) {
      console.error('Error creating notifications:', notifError)
    }

    // Send Telegram notification to hotel groups
    const { data: telegramGroups } = await supabase
      .from('telegram_group_connections')
      .select('chat_id')
      .eq('tenant_id', tenant_id)
      .or(`hotel_id.eq.${hotel_id},hotel_id.is.null`)
      .eq('is_active', true)
      .or('notification_types.cs.{chargeable_consumption},notification_types.cs.{all},notification_types.eq.{}')

    if (telegramGroups && telegramGroups.length > 0) {
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
      if (botToken) {
        for (const group of telegramGroups) {
          try {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: group.chat_id,
                text: message,
                parse_mode: 'HTML',
              }),
            })
          } catch (err) {
            console.error('Telegram send error:', err)
          }
        }
      }
    }

    return c.json({ 
      success: true, 
      notified: usersToNotify.length,
      telegram_groups: telegramGroups?.length || 0,
    }, { headers: buildCorsHeaders(c.req.raw) })

  } catch (error: unknown) {
    console.error('Error in notify-chargeable:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, { status: 500, headers: buildCorsHeaders(c.req.raw) })
  }
})

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

Deno.serve(app.fetch)
