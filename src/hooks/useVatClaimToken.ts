import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface VatClaimToken {
  token: string
  expires_at: string
  status: string
}

async function fetchEnsureToken(invoiceId: string): Promise<VatClaimToken | null> {
  const { data, error } = await supabase.rpc('ensure_vat_claim_token', { p_invoice_id: invoiceId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return { token: (row as any).token, expires_at: (row as any).expires_at, status: (row as any).status }
}

/** Reactive query — dùng trong UI khi muốn render theo token. */
export function useVatClaimToken(invoiceId: string | null | undefined) {
  return useQuery({
    queryKey: ['vat-claim-token', invoiceId],
    enabled: !!invoiceId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<VatClaimToken | null> => {
      if (!invoiceId) return null
      return fetchEnsureToken(invoiceId)
    },
  })
}

/** Imperative helper — dùng trước khi In/PDF để đảm bảo có token thật. */
export function useEnsureVatClaimToken() {
  const qc = useQueryClient()
  return async (invoiceId: string): Promise<VatClaimToken | null> => {
    const cached = qc.getQueryData<VatClaimToken | null>(['vat-claim-token', invoiceId])
    if (cached?.token) return cached
    const fresh = await fetchEnsureToken(invoiceId)
    qc.setQueryData(['vat-claim-token', invoiceId], fresh)
    return fresh
  }
}
