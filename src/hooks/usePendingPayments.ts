import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/hooks/useUser';

export interface PendingPayment {
  id: string;
  tenant_id: string;
  invoice_id: string | null;
  amount: number;
  payment_method: string | null;
  payment_status: string;
  transaction_reference: string | null;
  notes: string | null;
  created_at: string;
  payment_date: string | null;
  metadata: {
    bank_code?: string;
    bank_name?: string;
    account_number?: string;
    rooms?: number;
    duration_days?: number;
    type?: 'extend' | 'add_rooms' | 'quote_draft' | 'subscription_quote';
    [key: string]: unknown;
  };
  invoice?: {
    invoice_number: string;
    status: string;
    total_amount: number;
    notes: string | null;
    subscription_quote_id?: string | null;
  } | null;
}

export function usePendingPayments() {
  const { tenantId } = useUser();

  return useQuery({
    queryKey: ['pending-payments', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('payment_transactions')
        .select(`
          *,
          invoice:invoices(invoice_number, status, total_amount, notes, subscription_quote_id)
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as PendingPayment[];
    },
    enabled: !!tenantId,
    refetchInterval: 5000,
  });
}

export function usePendingPaymentsCount() {
  const { tenantId } = useUser();

  return useQuery({
    queryKey: ['pending-payments-count', tenantId],
    queryFn: async () => {
      if (!tenantId) return 0;

      const { count, error } = await supabase
        .from('payment_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'pending');

      if (error) throw error;
      return count || 0;
    },
    enabled: !!tenantId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
