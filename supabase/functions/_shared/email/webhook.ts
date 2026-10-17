/** Standard Webhooks/Svix signature used by Resend. Raw body must remain unchanged. */
export async function verifyEmailWebhook(body: string, headers: Headers, secret: string, now = Date.now()): Promise<boolean> {
  try {
    const id = headers.get('svix-id'), timestamp = headers.get('svix-timestamp'), signatures = headers.get('svix-signature')
    if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false
    const raw = atob(secret.replace(/^whsec_/, ''))
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(raw, c => c.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))
    return signatures.split(' ').some(signature => {
      if (!signature.startsWith('v1,')) return false
      const actual = Uint8Array.from(atob(signature.slice(3)), c => c.charCodeAt(0))
      if (actual.length !== expected.length) return false
      let difference = 0
      for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ actual[i]
      return difference === 0
    })
  } catch { return false }
}
