import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Get payment transactions for a specific tenant
 */
export function useTenantPayments(tenantId: string | null) {
  return useQuery({
    queryKey: ['tenant-payments', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('payment_transactions')
        .select(`
          *,
          subscription_plan:subscription_plans(name)
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });
}

/**
 * Get invoices for a specific tenant
 */
export function useTenantInvoices(tenantId: string | null) {
  return useQuery({
    queryKey: ['tenant-invoices', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          subscription_plan:subscription_plans(name),
          created_by_user:users!invoices_created_by_fkey(
            id,
            full_name,
            email
          )
        `)
        .eq('tenant_id', tenantId)
        .order('invoice_date', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });
}

/**
 * Get billing summary for a tenant
 */
export function useTenantBillingSummary(tenantId: string | null) {
  return useQuery({
    queryKey: ['tenant-billing-summary', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;

      const { data, error } = await supabase
        .rpc('get_tenant_billing_summary', {
          p_tenant_id: tenantId,
        });

      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });
}

/**
 * Get payment statistics for a tenant
 */
export function useTenantPaymentStats(tenantId: string | null) {
  return useQuery({
    queryKey: ['tenant-payment-stats', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;

      // Get total paid
      const { data: paidData, error: paidError } = await supabase
        .from('payment_transactions')
        .select('amount')
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'completed');

      if (paidError) throw paidError;

      const totalPaid = paidData.reduce((sum, t) => sum + (t.amount || 0), 0);

      // Get total outstanding
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('total_amount, status')
        .eq('tenant_id', tenantId)
        .in('status', ['draft', 'sent', 'overdue']);

      if (invoiceError) throw invoiceError;

      const totalOutstanding = invoiceData.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      // Get payment count
      const { count: paymentCount, error: countError } = await supabase
        .from('payment_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      if (countError) throw countError;

      // Get last payment date
      const { data: lastPayment, error: lastPaymentError } = await supabase
        .from('payment_transactions')
        .select('payment_date')
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'completed')
        .order('payment_date', { ascending: false })
        .limit(1)
        .single();

      return {
        totalPaid,
        totalOutstanding,
        paymentCount: paymentCount || 0,
        lastPaymentDate: lastPayment?.payment_date || null,
      };
    },
    enabled: !!tenantId,
  });
}
