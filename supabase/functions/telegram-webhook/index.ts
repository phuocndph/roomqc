import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: {
      id: number
      is_bot: boolean
      first_name: string
      username?: string
      language_code?: string
    }
    chat: {
      id: number
      type: 'private' | 'group' | 'supergroup' | 'channel'
      title?: string
      username?: string
      first_name?: string
    }
    date: number
    text?: string
    migrate_to_chat_id?: number // When group becomes supergroup
    migrate_from_chat_id?: number // When receiving from old group
  }
  my_chat_member?: {
    chat: {
      id: number
      type: 'private' | 'group' | 'supergroup' | 'channel'
      title?: string
    }
    from: {
      id: number
      first_name: string
      username?: string
    }
    new_chat_member: {
      user: {
        id: number
        is_bot: boolean
        first_name: string
        username?: string
      }
      status: 'member' | 'administrator' | 'left' | 'kicked'
    }
  }
}

// Helper function to delay execution
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  maxRetries: number = 2
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
          }),
        }
      )
      
      const result = await response.json()
      
      if (result.ok) {
        console.log(`Message sent successfully to ${chatId}`)
        return { ok: true }
      }
      
      // If chat not found and we have retries left, wait and retry
      if (result.error_code === 400 && attempt < maxRetries) {
        console.log(`Retry ${attempt + 1}/${maxRetries} for ${chatId} after error: ${result.description}`)
        await delay(1000)
        continue
      }
      
      console.error(`Failed to send to ${chatId}:`, result.error_code, result.description)
      return { ok: false, error: result.description }
    } catch (error) {
      console.error('Failed to send message:', error)
      if (attempt === maxRetries) {
        return { ok: false, error: String(error) }
      }
      await delay(1000)
    }
  }
  return { ok: false, error: 'Max retries exceeded' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Allow GET for webhook verification
  if (req.method === 'GET') {
    return new Response('Telegram webhook is active', { 
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
    })
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN not configured')
      return new Response('OK', { status: 200 })
    }
    
    // Validate webhook secret token to prevent spoofing
    const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
    if (webhookSecret) {
      const receivedSecret = req.headers.get('X-Telegram-Bot-Api-Secret-Token')
      if (receivedSecret !== webhookSecret) {
        console.error('REJECTED: Invalid or missing webhook secret token')
        return new Response('Unauthorized', { status: 401 })
      }
      console.log('Webhook secret validated successfully')
    } else {
      console.warn('WARNING: TELEGRAM_WEBHOOK_SECRET not configured - webhook is not protected')
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const update: TelegramUpdate = await req.json()
    console.log('Received Telegram update:', JSON.stringify(update, null, 2))
    
    // Handle group migration (group -> supergroup)
    if (update.message?.migrate_to_chat_id) {
      const oldChatId = update.message.chat.id
      const newChatId = update.message.migrate_to_chat_id
      
      console.log(`Group migrated: ${oldChatId} -> ${newChatId}`)
      
      // Update chat_id in database
      const { error } = await supabase
        .from('telegram_groups')
        .update({ 
          chat_id: String(newChatId), 
          updated_at: new Date().toISOString() 
        })
        .eq('chat_id', String(oldChatId))
      
      if (error) {
        console.error('Error updating migrated group:', error)
      } else {
        console.log(`Successfully updated group chat_id from ${oldChatId} to ${newChatId}`)
      }
      
      return new Response('OK', { status: 200 })
    }
    
    // Handle /start command from private chat
    if (update.message?.text?.startsWith('/start') && update.message.chat.type === 'private') {
      const chatId = update.message.chat.id
      const fromUser = update.message.from
      const startParam = update.message.text.split(' ')[1] // /start USER_UUID
      
      console.log(`Received /start from chat ${chatId}, param: ${startParam}`)
      
      if (startParam && startParam.length === 36) {
        // Validate UUID format and check user exists
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('id, tenant_id, full_name')
          .eq('id', startParam)
          .single()
        
        if (userError || !user) {
          console.error('User not found:', startParam)
          await sendTelegramMessage(botToken, chatId,
            '❌ Không tìm thấy tài khoản.\n\n' +
            'Vui lòng sử dụng đường link kết nối từ ứng dụng RoomQc.'
          )
          return new Response('OK', { status: 200 })
        }
        
        // Upsert connection
        const { error: upsertError } = await supabase
          .from('telegram_connections')
          .upsert({
            user_id: user.id,
            tenant_id: user.tenant_id,
            chat_id: String(chatId),
            chat_type: 'private',
            username: fromUser.username,
            first_name: fromUser.first_name,
            is_active: true,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,chat_id'
          })
        
        if (upsertError) {
          console.error('Error saving connection:', upsertError)
          await delay(500) // Small delay before sending
          await sendTelegramMessage(botToken, chatId,
            '❌ Có lỗi xảy ra khi kết nối.\n\nVui lòng thử lại sau.'
          )
        } else {
          console.log(`Successfully connected user ${user.id} to chat ${chatId}`)
          
          // ✅ AUTO-SYNC: Cập nhật telegram_username vào users table
          if (fromUser.username) {
            const { error: updateUserError } = await supabase
              .from('users')
              .update({ telegram_username: fromUser.username })
              .eq('id', user.id)
            
            if (updateUserError) {
              console.error('Error auto-syncing telegram_username:', updateUserError)
            } else {
              console.log(`Auto-synced telegram_username: @${fromUser.username} for user ${user.id}`)
            }
          }
          
          await delay(500) // Small delay before sending welcome message
          const result = await sendTelegramMessage(botToken, chatId,
            `✅ <b>Kết nối thành công!</b>\n\n` +
            `Xin chào <b>${user.full_name || fromUser.first_name}</b>!\n\n` +
            `Bạn sẽ nhận thông báo từ RoomQc tại đây.\n\n` +
            `📱 Các loại thông báo:\n` +
            `• 🏨 Đặt phòng mới\n` +
            `• 🔧 Yêu cầu bảo trì\n` +
            `• 📦 Cảnh báo kho\n` +
            `• 🧺 Cập nhật giặt ủi\n\n` +
            (fromUser.username 
              ? `📞 Username của bạn (@${fromUser.username}) đã được lưu để đồng nghiệp liên lạc.\n\n`
              : ''
            ) +
            `Để ngừng nhận thông báo, gõ /stop`
          )
          if (!result.ok) {
            console.log(`Note: Connection saved but welcome message failed: ${result.error}`)
          }
        }
      } else {
        // No valid param, show instructions
        await sendTelegramMessage(botToken, chatId,
          `👋 Xin chào!\n\n` +
          `Để kết nối với RoomQc, vui lòng:\n\n` +
          `1. Đăng nhập vào ứng dụng RoomQc\n` +
          `2. Vào <b>Cài đặt > Telegram</b>\n` +
          `3. Nhấn nút <b>"Kết nối Telegram"</b>\n\n` +
          `Hoặc sử dụng đường link được cung cấp trong ứng dụng.`
        )
      }
      
      return new Response('OK', { status: 200 })
    }
    
    // Handle /stop command
    if (update.message?.text === '/stop' && update.message.chat.type === 'private') {
      const chatId = update.message.chat.id
      
      const { error } = await supabase
        .from('telegram_connections')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('chat_id', String(chatId))
      
      if (!error) {
        await sendTelegramMessage(botToken, chatId,
          '🔕 Đã tắt thông báo Telegram.\n\n' +
          'Để bật lại, vui lòng kết nối lại từ ứng dụng RoomQc.'
        )
      }
      
      return new Response('OK', { status: 200 })
    }
    
    // Handle /status command - for private chats
    if (update.message?.text === '/status' && update.message.chat.type === 'private') {
      const chatId = update.message.chat.id
      
      const { data: connection } = await supabase
        .from('telegram_connections')
        .select('*, users(full_name)')
        .eq('chat_id', String(chatId))
        .eq('is_active', true)
        .single()
      
      if (connection) {
        await sendTelegramMessage(botToken, chatId,
          `✅ <b>Trạng thái kết nối</b>\n\n` +
          `Tài khoản: <b>${(connection.users as any)?.full_name || 'N/A'}</b>\n` +
          `Trạng thái: Đang hoạt động ✓\n\n` +
          `Bạn đang nhận thông báo từ RoomQc.`
        )
      } else {
        await sendTelegramMessage(botToken, chatId,
          `❌ Chưa kết nối với RoomQc.\n\n` +
          `Vui lòng kết nối từ ứng dụng RoomQc.`
        )
      }
      
      return new Response('OK', { status: 200 })
    }
    
    // Handle /status command - for groups/supergroups
    if (update.message?.text?.startsWith('/status') && 
        (update.message.chat.type === 'group' || update.message.chat.type === 'supergroup')) {
      const chatId = update.message.chat.id
      const chatTitle = update.message.chat.title || 'Unknown Group'
      
      const { data: group } = await supabase
        .from('telegram_groups')
        .select('*, tenants(name)')
        .eq('chat_id', String(chatId))
        .eq('is_active', true)
        .single()
      
      if (group) {
        await sendTelegramMessage(botToken, chatId,
          `✅ <b>Trạng thái nhóm "${chatTitle}"</b>\n\n` +
          `Khách sạn: <b>${(group.tenants as any)?.name || 'N/A'}</b>\n` +
          `Loại nhóm: <b>${group.group_type}</b>\n` +
          `Trạng thái: Đang hoạt động ✓\n\n` +
          `Nhóm này đang nhận thông báo từ RoomQc.`
        )
      } else {
        await sendTelegramMessage(botToken, chatId,
          `❌ <b>Nhóm chưa được kết nối với RoomQc</b>\n\n` +
          `Mã nhóm: <code>${chatId}</code>\n\n` +
          `Để kết nối, vào ứng dụng RoomQc > Cài đặt > Telegram > Thêm nhóm.`
        )
      }
      
      return new Response('OK', { status: 200 })
    }
    
    // Handle bot added to group
    if (update.my_chat_member) {
      const chatMember = update.my_chat_member
      const newStatus = chatMember.new_chat_member.status
      const chatId = chatMember.chat.id
      const chatTitle = chatMember.chat.title || 'Unknown Group'
      const fromUserId = String(chatMember.from.id)
      
      if (newStatus === 'member' || newStatus === 'administrator') {
        console.log(`Bot added to group: ${chatTitle} (${chatId}) by user ${fromUserId}`)
        
        // Check for pending link request from this user
        const { data: pendingLink } = await supabase
          .from('pending_group_links')
          .select('*')
          .eq('telegram_user_id', fromUserId)
          .eq('status', 'pending')
          .gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        
        if (pendingLink) {
          console.log(`Found pending link for user ${fromUserId}, auto-registering group`)
          
          // Check if group already exists
          const { data: existingGroup } = await supabase
            .from('telegram_groups')
            .select('id')
            .eq('chat_id', String(chatId))
            .maybeSingle()
          
          if (existingGroup) {
            // Update existing group
            await supabase
              .from('telegram_groups')
              .update({
                tenant_id: pendingLink.tenant_id,
                hotel_id: pendingLink.hotel_id,
                chat_title: chatTitle,
                group_type: pendingLink.group_type || 'staff',
                department: pendingLink.department,
                notification_types: pendingLink.notification_types,
                added_by: pendingLink.added_by,
                is_active: true,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingGroup.id)
          } else {
            // Insert new group
            await supabase
              .from('telegram_groups')
              .insert({
                tenant_id: pendingLink.tenant_id,
                hotel_id: pendingLink.hotel_id,
                chat_id: String(chatId),
                chat_title: chatTitle,
                group_type: pendingLink.group_type || 'staff',
                department: pendingLink.department,
                notification_types: pendingLink.notification_types,
                added_by: pendingLink.added_by,
                is_active: true
              })
          }
          
          // Update pending link status
          await supabase
            .from('pending_group_links')
            .update({ 
              status: 'completed', 
              chat_id: String(chatId) 
            })
            .eq('id', pendingLink.id)
          
          // Send success message
          const deptLabel = pendingLink.department || 'Chung'
          await sendTelegramMessage(botToken, chatId,
            `✅ <b>Nhóm đã được liên kết tự động!</b>\n\n` +
            `Nhóm "<b>${chatTitle}</b>" đã được kết nối thành công.\n` +
            `Bộ phận: <b>${deptLabel}</b>\n\n` +
            `Nhóm này sẽ nhận thông báo từ RoomQc.`
          )
        } else {
          // No pending link - show manual instructions
          await sendTelegramMessage(botToken, chatId,
            `🏨 <b>RoomQc Notification Bot</b>\n\n` +
            `Bot đã được thêm vào nhóm "<b>${chatTitle}</b>".\n\n` +
            `📋 <b>Để kết nối với hệ thống:</b>\n\n` +
            `1. Đăng nhập vào ứng dụng RoomQc (quyền Owner/Manager)\n` +
            `2. Vào <b>Cài đặt > Telegram</b>\n` +
            `3. Nhấn <b>"Thêm nhóm"</b>\n` +
            `4. Nhập mã nhóm:\n\n` +
            `<code>${chatId}</code>\n\n` +
            `⚠️ Lưu ý: Chỉ Owner và Manager mới có quyền thêm nhóm.`
          )
        }
      } else if (newStatus === 'left' || newStatus === 'kicked') {
        console.log(`Bot removed from group: ${chatTitle} (${chatId})`)
        
        // Deactivate group in database
        await supabase
          .from('telegram_groups')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('chat_id', String(chatId))
      }
      
      return new Response('OK', { status: 200 })
    }
    
    // Handle group messages with /link command
    if (update.message?.text?.startsWith('/link') && 
        (update.message.chat.type === 'group' || update.message.chat.type === 'supergroup')) {
      const chatId = update.message.chat.id
      const chatTitle = update.message.chat.title || 'Unknown Group'
      const linkParam = update.message.text.split(' ')[1] // /link TENANT_UUID
      
      if (linkParam && linkParam.length === 36) {
        // Validate tenant exists
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id, name')
          .eq('id', linkParam)
          .single()
        
        if (tenant) {
          // Check if group already exists
          const { data: existingGroup } = await supabase
            .from('telegram_groups')
            .select('id')
            .eq('chat_id', String(chatId))
            .single()
          
          if (existingGroup) {
            // Update existing
            await supabase
              .from('telegram_groups')
              .update({
                tenant_id: tenant.id,
                chat_title: chatTitle,
                is_active: true,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingGroup.id)
          } else {
            // Insert new
            await supabase
              .from('telegram_groups')
              .insert({
                tenant_id: tenant.id,
                chat_id: String(chatId),
                chat_title: chatTitle,
                group_type: 'general',
                is_active: true
              })
          }
          
          await sendTelegramMessage(botToken, chatId,
            `✅ <b>Kết nối thành công!</b>\n\n` +
            `Nhóm "<b>${chatTitle}</b>" đã được liên kết với <b>${tenant.name}</b>.\n\n` +
            `Nhóm này sẽ nhận thông báo từ RoomQc.`
          )
        } else {
          await sendTelegramMessage(botToken, chatId,
            `❌ Không tìm thấy khách sạn.\n\nVui lòng kiểm tra lại mã liên kết.`
          )
        }
      } else {
        await sendTelegramMessage(botToken, chatId,
          `📋 <b>Mã nhóm của bạn:</b>\n\n` +
          `<code>${chatId}</code>\n\n` +
          `Sử dụng mã này trong ứng dụng RoomQc để thêm nhóm.`
        )
      }
      
      return new Response('OK', { status: 200 })
    }
    
    // Default response for unhandled updates
    return new Response('OK', { status: 200 })
    
  } catch (error) {
    console.error('Error processing webhook:', error)
    // Always return 200 to prevent Telegram from retrying
    return new Response('OK', { status: 200 })
  }
})
