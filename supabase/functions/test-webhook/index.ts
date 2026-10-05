import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface TestWebhookPayload {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url, method = 'POST', headers = {}, body }: TestWebhookPayload = await req.json()

    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Thiếu URL webhook' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'URL không hợp lệ' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Chỉ hỗ trợ http(s)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const upperMethod = method.toUpperCase()
    const hasBody = !['GET', 'HEAD'].includes(upperMethod) && body && body.length > 0

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const startedAt = Date.now()

    let response: Response
    try {
      response = await fetch(url, {
        method: upperMethod,
        headers,
        body: hasBody ? body : undefined,
        signal: controller.signal,
      })
    } catch (err: any) {
      clearTimeout(timeout)
      const aborted = err?.name === 'AbortError'
      return new Response(
        JSON.stringify({
          ok: false,
          error: aborted ? 'Timeout sau 15s' : (err?.message ?? 'Network error'),
          duration_ms: Date.now() - startedAt,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    clearTimeout(timeout)

    const text = await response.text()
    const preview = text.length > 2000 ? text.slice(0, 2000) + '…' : text

    return new Response(
      JSON.stringify({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        duration_ms: Date.now() - startedAt,
        response_preview: preview,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
