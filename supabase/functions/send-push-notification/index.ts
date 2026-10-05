import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildCorsHeaders } from '../_shared/cors.ts'

interface PushPayload {
  user_id?: string
  user_ids?: string[]
  tenant_id?: string
  title: string
  body: string
  icon?: string
  badge?: string
  image?: string
  tag?: string
  action_url?: string
  notification_type?: string
  data?: Record<string, any>
  skip_auth_check?: boolean // Skip tenant verification for self-notifications
}

interface PushSubscriptionRow {
  id: string
  user_id: string
  tenant_id: string
  endpoint: string
  p256dh_key: string
  auth_key: string
  failed_count: number
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Base64url encode/decode utilities
function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Generate VAPID JWT token
async function generateVapidJwt(
  audience: string,
  subject: string,
  vapidPrivateKeyBase64: string,
  vapidPublicKeyBase64: string
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject,
  }

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const unsignedToken = `${headerB64}.${payloadB64}`

  try {
    // Decode keys
    const privateKeyBytes = base64UrlDecode(vapidPrivateKeyBase64)
    const publicKeyBytes = base64UrlDecode(vapidPublicKeyBase64)

    // Extract x and y from the public key (uncompressed format: 0x04 || x || y)
    // Public key is 65 bytes: 1 byte prefix + 32 bytes x + 32 bytes y
    if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 0x04) {
      throw new Error('Invalid public key format')
    }
    
    const x = publicKeyBytes.slice(1, 33)
    const y = publicKeyBytes.slice(33, 65)

    // Create JWK with the actual key pair
    const privateJwk = {
      kty: 'EC',
      crv: 'P-256',
      d: base64UrlEncode(privateKeyBytes),
      x: base64UrlEncode(x),
      y: base64UrlEncode(y),
    }

    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      privateJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    )

    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      new TextEncoder().encode(unsignedToken)
    )

    const signatureB64 = base64UrlEncode(new Uint8Array(signature))
    return `${unsignedToken}.${signatureB64}`
  } catch (e) {
    console.error('Failed to sign VAPID JWT:', e)
    throw new Error(`VAPID signing failed: ${e}`)
  }
}

// HKDF key derivation
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    ikm.buffer as ArrayBuffer,
    'HKDF',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { 
      name: 'HKDF', 
      hash: 'SHA-256', 
      salt: salt.buffer as ArrayBuffer, 
      info: info.buffer as ArrayBuffer 
    },
    keyMaterial,
    length * 8
  )
  return new Uint8Array(bits)
}

// Encrypt payload using aes128gcm encoding (RFC 8291)
async function encryptPayload(
  payload: string,
  userPublicKeyBase64: string,
  userAuthBase64: string
): Promise<Uint8Array> {
  const userPublicKey = base64UrlDecode(userPublicKeyBase64)
  const userAuth = base64UrlDecode(userAuthBase64)

  // Generate ephemeral ECDH key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )

  // Import user's public key
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    userPublicKey.buffer as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    serverKeyPair.privateKey,
    256
  )

  // Export server public key
  const serverPublicKeyRaw = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)
  const serverPublicKeyBytes = new Uint8Array(serverPublicKeyRaw)

  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // Build info for key derivation
  const keyInfoBuffer = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\0'),
    ...userPublicKey,
    ...serverPublicKeyBytes,
  ])

  // Derive IKM from shared secret and auth
  const ikm = await hkdf(userAuth, new Uint8Array(sharedSecret), keyInfoBuffer, 32)

  // Derive content encryption key
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0')
  const contentEncryptionKey = await hkdf(salt, ikm, cekInfo, 16)

  // Derive nonce
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0')
  const nonce = await hkdf(salt, ikm, nonceInfo, 12)

  // Encrypt the payload
  const paddedPayload = new Uint8Array([
    ...new TextEncoder().encode(payload),
    2, // Delimiter
  ])

  const key = await crypto.subtle.importKey(
    'raw',
    contentEncryptionKey.buffer as ArrayBuffer,
    'AES-GCM',
    false,
    ['encrypt']
  )

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer },
    key,
    paddedPayload
  )

  // Build the final message: salt (16) + rs (4) + idlen (1) + keyid (65) + ciphertext
  const recordSize = 4096
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, recordSize, false)

  const result = new Uint8Array([
    ...salt,
    ...rs,
    65, // keyid length (uncompressed P-256 public key)
    ...serverPublicKeyBytes,
    ...new Uint8Array(encrypted),
  ])

  return result
}

async function sendPushNotification(
  subscription: PushSubscriptionRow,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<{ success: boolean; expired?: boolean; error?: string }> {
  try {
    const endpoint = subscription.endpoint
    const url = new URL(endpoint)
    const audience = `${url.protocol}//${url.host}`

    // Generate VAPID JWT
    const jwt = await generateVapidJwt(audience, 'mailto:support@roomweave.app', vapidPrivateKey, vapidPublicKey)

    // Encrypt the payload
    const encryptedPayload = await encryptPayload(
      payload,
      subscription.p256dh_key,
      subscription.auth_key
    )

    console.log(`Sending push to: ${endpoint.substring(0, 60)}...`)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400',
        'Urgency': 'high',
        'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`,
      },
      body: encryptedPayload.buffer as ArrayBuffer,
    })

    if (response.status === 201 || response.status === 200) {
      console.log(`Push sent successfully (${response.status})`)
      return { success: true }
    }

    if (response.status === 410 || response.status === 404) {
      console.log(`Subscription expired (${response.status})`)
      return { success: false, expired: true, error: 'Subscription expired' }
    }

    const errorText = await response.text()
    console.error(`Push failed: ${response.status} - ${errorText}`)
    return { success: false, error: `HTTP ${response.status}: ${errorText}` }
  } catch (error) {
    console.error('Push error:', error)
    return { success: false, error: String(error) }
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured')
      return jsonResponse(
        {
          success: false,
          code: 'VAPID_NOT_CONFIGURED',
          error: 'Web Push is not configured on the server.',
        },
        503,
        corsHeaders
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const payload: PushPayload = await req.json()

    console.log('Received push request:', JSON.stringify(payload, null, 2))

    // Get target user IDs
    const userIds = payload.user_ids || (payload.user_id ? [payload.user_id] : [])
    
    if (userIds.length === 0) {
      throw new Error('No user_id or user_ids provided')
    }

    const authHeader = req.headers.get('Authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse(
        { success: false, code: 'UNAUTHORIZED', error: 'Missing bearer token.' },
        401,
        corsHeaders
      )
    }

    const token = authHeader.slice('Bearer '.length).trim()
    const isServiceRequest = token === supabaseServiceKey
    let callingUser: { id: string } | null = null

    if (!isServiceRequest) {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      })
      const { data: authData, error: authError } = await supabaseAuth.auth.getUser()

      if (authError || !authData.user) {
        return jsonResponse(
          { success: false, code: 'UNAUTHORIZED', error: 'Invalid access token.' },
          401,
          corsHeaders
        )
      }
      callingUser = authData.user
    }

    const isSelfNotification = callingUser !== null &&
      userIds.length === 1 &&
      userIds[0] === callingUser.id

    if (payload.skip_auth_check && !isServiceRequest && !isSelfNotification) {
      return jsonResponse(
        { success: false, code: 'FORBIDDEN', error: 'skip_auth_check is allowed only for self-notifications.' },
        403,
        corsHeaders
      )
    }

    // Fetch subscriptions immediately (always needed)
    const subscriptionsPromise = supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds)
      .eq('is_active', true)

    // Service-to-service calls are trusted. User calls are restricted to the
    // caller's tenant unless they target only their own account.
    let authCheckPromise: Promise<void> = Promise.resolve()
    
    if (!isServiceRequest && !isSelfNotification && callingUser) {
      authCheckPromise = (async () => {
        const [callerResult, targetResult] = await Promise.all([
          supabase.from('users').select('tenant_id').eq('id', callingUser.id).single(),
          supabase.from('users').select('id, tenant_id').in('id', userIds)
        ])

        const callerData = callerResult.data
        const targetUsers = targetResult.data

        if (!callerData?.tenant_id) {
          throw new Error('Calling user does not belong to a tenant')
        }

        const foundUserIds = new Set(targetUsers?.map(user => user.id) || [])
        if (userIds.some(userId => !foundUserIds.has(userId))) {
          throw new Error('One or more notification recipients were not found')
        }

        const crossTenantUsers = targetUsers?.filter(user => user.tenant_id !== callerData.tenant_id) || []
        if (crossTenantUsers.length > 0) {
          console.error('Cross-tenant notification attempt blocked:', {
            callerId: callingUser.id,
            callerTenant: callerData.tenant_id,
            blockedUsers: crossTenantUsers.map(user => user.id)
          })
          throw new Error('Cannot send notifications to users in different tenants')
        }

        if (payload.tenant_id && payload.tenant_id !== callerData.tenant_id) {
          throw new Error('Notification tenant does not match the calling user')
        }
      })()
    }

    // Wait for both operations in parallel
    const [subscriptionsResult] = await Promise.all([
      subscriptionsPromise,
      authCheckPromise
    ])

    const { data: subscriptions, error: fetchError } = subscriptionsResult

    if (fetchError) {
      console.error('Error fetching subscriptions:', fetchError)
      throw fetchError
    }

    console.log(`Found ${subscriptions?.length || 0} active subscriptions for users: ${userIds.join(', ')}`)

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No active push subscriptions found - user(s) may not have enabled push notifications on any device')
      return new Response(
        JSON.stringify({ 
          success: true, 
          sent: 0, 
          message: 'Người dùng chưa đăng ký thiết bị nào để nhận thông báo đẩy' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prepare notification payload with Vietnamese support
    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icon-192x192.png',
      badge: payload.badge || '/icon-72x72.png',
      image: payload.image,
      tag: payload.tag || 'default',
      notification_type: payload.notification_type || payload.data?.type || 'default',
      data: {
        url: payload.action_url || '/',
        type: payload.notification_type || payload.data?.type || 'default',
        ...payload.data,
      },
    })

    // Send push to each subscription
    const results = await Promise.all(
      subscriptions.map((sub: PushSubscriptionRow) =>
        sendPushNotification(sub, notificationPayload, vapidPublicKey, vapidPrivateKey)
          .then(result => ({ ...result, subscriptionId: sub.id, userId: sub.user_id }))
      )
    )

    // Handle expired subscriptions
    const expiredIds = results
      .filter(r => r.expired)
      .map(r => r.subscriptionId)

    if (expiredIds.length > 0) {
      await supabase
        .from('push_subscriptions')
        .update({ is_active: false })
        .in('id', expiredIds)
      
      console.log(`Deactivated ${expiredIds.length} expired subscriptions`)
    }

    // Update failed counts
    const failedResults = results.filter(r => !r.success && !r.expired)
    
    for (const failed of failedResults) {
      const sub = subscriptions.find((s: PushSubscriptionRow) => s.id === failed.subscriptionId)
      if (sub) {
        const newFailedCount = (sub.failed_count || 0) + 1
        
        if (newFailedCount >= 5) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false, failed_count: newFailedCount })
            .eq('id', sub.id)
          console.log(`Deactivated subscription ${sub.id} due to ${newFailedCount} failures`)
        } else {
          await supabase
            .from('push_subscriptions')
            .update({ failed_count: newFailedCount })
            .eq('id', sub.id)
        }
      }
    }

    const successCount = results.filter(r => r.success).length
    console.log(`Push results: ${successCount}/${subscriptions.length} successful`)

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        total: subscriptions.length,
        expired: expiredIds.length,
        failed: failedResults.length,
        results: results.map(r => ({
          userId: r.userId,
          success: r.success,
          expired: r.expired,
          error: r.error,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
