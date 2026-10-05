import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCorsHeaders } from '../_shared/cors.ts'

interface IssueRequest {
  token: string
  company_name: string
  tax_code: string
  company_address?: string
  email: string
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = (await req.json()) as IssueRequest
    if (!body?.token || !body?.company_name || !body?.tax_code || !body?.email) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Submit claim (validates + updates invoice + claim row)
    const { data: submitData, error: submitErr } = await supabase.rpc('submit_vat_claim_public', {
      p_token: body.token,
      p_company_name: body.company_name,
      p_tax_code: body.tax_code,
      p_company_address: body.company_address ?? null,
      p_email: body.email,
    })

    if (submitErr) {
      const code = submitErr.message?.match(/[a-z_]+/i)?.[0] || 'submit_failed'
      return new Response(JSON.stringify({ error: code }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const claimId = (submitData as any)?.claim_id
    const invoiceId = (submitData as any)?.invoice_id

    // 2. Send invoice email (existing function handles HTML rendering)
    const { error: emailErr } = await supabase.functions.invoke('send-invoice-email', {
      body: { invoice_id: invoiceId, to_email: body.email },
    })

    if (emailErr) {
      console.error('send-invoice-email failed', emailErr)
      // do not block claim — still mark issued = false (status remains submitted)
      return new Response(JSON.stringify({
        ok: true, claim_id: claimId, invoice_id: invoiceId,
        email_sent: false, warning: 'email_failed',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Mark as issued (Phase 1 stub — provider = 'internal_stub')
    await supabase.rpc('mark_vat_claim_issued', {
      p_claim_id: claimId,
      p_provider: 'internal_stub',
      p_pdf_path: null,
      p_lookup_code: null,
    })

    return new Response(JSON.stringify({
      ok: true, claim_id: claimId, invoice_id: invoiceId, email_sent: true,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('issue-einvoice error', e)
    return new Response(JSON.stringify({ error: e?.message || 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
