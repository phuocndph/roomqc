// Edge function: fan-out chat message → in_app_notifications + push (Web Push)
// Triggered from DB trigger via pg_net.http_post
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildCorsHeaders } from '../_shared/cors.ts'
import { isInternalRequest } from '../_shared/internalAuth.ts'

interface Payload {
  message_id: string
  conversation_id: string
  tenant_id: string
  hotel_id: string
  sender_id: string
  body: string | null
  has_attachment?: boolean
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    if (!isInternalRequest(req)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, serviceKey)
    const p = (await req.json()) as Payload

    if (!p.message_id || !p.conversation_id || !p.sender_id) {
      return new Response(JSON.stringify({ error: 'missing fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Re-read the message server-side. The trigger payload is not trusted input.
    const { data: message } = await supabase
      .from('messages')
      .select('id, conversation_id, tenant_id, sender_id, body')
      .eq('id', p.message_id)
      .maybeSingle()
    if (!message || message.conversation_id !== p.conversation_id || message.tenant_id !== p.tenant_id || message.sender_id !== p.sender_id) {
      return new Response(JSON.stringify({ error: 'message payload mismatch' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    p.body = message.body
    p.tenant_id = message.tenant_id
    p.sender_id = message.sender_id

    // 30s dedupe: skip if a notification for this conversation+sender exists in last 30s
    const since = new Date(Date.now() - 30 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('in_app_notifications')
      .select('id')
      .eq('type', 'chat_message')
      .gte('created_at', since)
      .contains('metadata', { conversation_id: p.conversation_id, sender_id: p.sender_id })
      .limit(1)
    const dedupe = (recent?.length || 0) > 0

    // Load conversation + members (exclude sender, exclude muted, exclude left)
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, type, name')
      .eq('id', p.conversation_id)
      .single()
    if (!conv) throw new Error('conversation not found')

    const { data: members } = await supabase
      .from('conversation_members')
      .select('user_id, muted_until')
      .eq('conversation_id', p.conversation_id)
      .is('left_at', null)
    const now = new Date()
    const recipients = (members || [])
      .filter((m: any) => m.user_id !== p.sender_id)
      .filter((m: any) => !m.muted_until || new Date(m.muted_until) < now)
      .map((m: any) => m.user_id)

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ success: true, recipients: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: sender } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', p.sender_id)
      .single()

    const senderName = sender?.full_name || 'Người dùng'
    const title = conv.type === 'group' ? (conv.name || 'Nhóm') : senderName
    const bodyPreview =
      (p.body && p.body.trim()) ||
      (p.has_attachment ? '[đính kèm]' : 'Tin nhắn mới')
    const finalBody =
      conv.type === 'group' ? `${senderName}: ${bodyPreview}` : bodyPreview
    const actionUrl = `/chat/${p.conversation_id}`

    // Insert in-app notifications (skip if dedupe)
    if (!dedupe) {
      const rows = recipients.map((uid) => ({
        tenant_id: p.tenant_id,
        user_id: uid,
        title,
        body: finalBody,
        type: 'chat_message',
        action_url: actionUrl,
        metadata: {
          conversation_id: p.conversation_id,
          sender_id: p.sender_id,
          message_id: p.message_id,
        },
      }))
      await supabase.from('in_app_notifications').insert(rows)
    }

    // Push (fire-and-forget)
    try {
      await fetch(`${url}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_ids: recipients,
          title,
          body: finalBody,
          tag: `chat-${p.conversation_id}`,
          notification_type: 'chat_message',
          action_url: actionUrl,
          data: {
            conversation_id: p.conversation_id,
            message_id: p.message_id,
            type: 'chat_message',
          },
        }),
      })
    } catch (e) {
      console.error('push failed', e)
    }

    return new Response(
      JSON.stringify({ success: true, recipients: recipients.length, deduped: dedupe }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('notify-new-message error', e)
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
