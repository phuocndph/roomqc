import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCronAuth } from '../_shared/cronAuth.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = requireCronAuth(req, corsHeaders)
  if (denied) return denied

  try {
    console.log("[expire-pending-payments] Starting cleanup job...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Find pending payment transactions older than 24 hours
    const { data: expiredTransactions, error: fetchError } = await supabase
      .from("payment_transactions")
      .select("id, invoice_id, created_at")
      .eq("payment_status", "pending")
      .lt("created_at", twentyFourHoursAgo.toISOString());

    if (fetchError) {
      console.error("[expire-pending-payments] Error fetching transactions:", fetchError);
      throw fetchError;
    }

    if (!expiredTransactions || expiredTransactions.length === 0) {
      console.log("[expire-pending-payments] No expired pending transactions found");
      return new Response(
        JSON.stringify({ success: true, expired_count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[expire-pending-payments] Found ${expiredTransactions.length} expired transactions`);

    // Update transactions to expired status
    const transactionIds = expiredTransactions.map((t) => t.id);
    const { error: updateTransactionsError } = await supabase
      .from("payment_transactions")
      .update({ 
        payment_status: "expired",
        notes: "Tự động hết hạn sau 24 giờ không nhận được thanh toán"
      })
      .in("id", transactionIds);

    if (updateTransactionsError) {
      console.error("[expire-pending-payments] Error updating transactions:", updateTransactionsError);
      throw updateTransactionsError;
    }

    // Get unique invoice IDs
    const invoiceIds = [...new Set(expiredTransactions.map((t) => t.invoice_id).filter(Boolean))];

    if (invoiceIds.length > 0) {
      // Update related invoices to cancelled
      const { error: updateInvoicesError } = await supabase
        .from("invoices")
        .update({ 
          status: "cancelled",
          notes: "Hóa đơn bị hủy do hết hạn thanh toán"
        })
        .in("id", invoiceIds)
        .eq("status", "pending"); // Only update pending invoices

      if (updateInvoicesError) {
        console.error("[expire-pending-payments] Error updating invoices:", updateInvoicesError);
        // Don't throw - transaction update was successful
      } else {
        console.log(`[expire-pending-payments] Updated ${invoiceIds.length} invoices to cancelled`);
      }
    }

    console.log(`[expire-pending-payments] Successfully expired ${expiredTransactions.length} transactions`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        expired_count: expiredTransactions.length,
        cancelled_invoices: invoiceIds.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[expire-pending-payments] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
