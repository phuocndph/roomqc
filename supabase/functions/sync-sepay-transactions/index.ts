import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Normalize string: remove special characters and convert to uppercase
function normalizeString(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function gatewayTransactionKey(accountNumber: string, transactionId: number) {
  return `${normalizeString(accountNumber)}:${transactionId}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function isPaymentConflict(error: unknown): boolean {
  if (isUniqueViolation(error)) return true;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  return /already_(processed|completed|claimed)|already processed|already completed|already claimed|gateway_transaction_already_processed/i.test(
    message,
  );
}

interface SepayTransaction {
  id: number;
  transaction_date: string;
  amount_in: number;
  amount_out: number;
  accumulated: number;
  transaction_content: string;
  reference_number: string;
  code: string | null;
  sub_account: string | null;
  bank_brand_name: string;
  account_number: string;
}

interface PendingPayment {
  id: string;
  amount: number;
  transaction_reference: string | null;
  tenant_id: string;
  invoice_id: string | null;
  metadata: Record<string, unknown> | null;
  invoice: {
    id: string;
    invoice_number: string;
    status: string;
    tenant_id: string;
  } | null;
}

const DEFAULT_TOLERANCE_VND = 1000;

Deno.serve(async (req) => {
  console.log("=== Sync SePay Transactions ===");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          Allow: "POST, OPTIONS",
          "Content-Type": "application/json",
        },
      },
    );
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env
    .get("SUPABASE_SERVICE_ROLE_KEY")
    ?.trim();
  const SEPAY_API_KEY = Deno.env.get("SEPAY_API_KEY")?.trim();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Supabase integration is not configured",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Require authentication unconditionally; require owner or super_admin.
    const authHeader = req.headers.get("Authorization");
    const authMatch = authHeader?.match(/^\s*Bearer\s+(.+?)\s*$/i);
    if (!authMatch) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const token = authMatch[1];
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const { data: userData } = await supabase
      .from("users")
      .select(
        "user_level_code, tenant_id, is_super_admin, status, account_locked, deleted_at",
      )
      .eq("id", user.id)
      .single();
    const hasAllowedRole =
      userData?.is_super_admin === true ||
      ["super_admin", "tenant_owner"].includes(userData?.user_level_code ?? "");
    if (
      !userData ||
      !hasAllowedRole ||
      userData.status !== "active" ||
      userData.account_locked === true ||
      userData.deleted_at
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Forbidden: Owner or Super Admin required",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!SEPAY_API_KEY) {
      console.error(
        "SEPAY_API_KEY is not configured; refusing to call the SePay API",
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "SePay integration is not configured",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const isSuperAdmin =
      userData.user_level_code === "super_admin" ||
      userData.is_super_admin === true;
    const callerTenantId = userData.tenant_id as string | null;
    if (!isSuperAdmin && !callerTenantId) {
      return new Response(
        JSON.stringify({ success: false, error: "Tenant context is required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Query only the caller's tenant unless this is an explicit super-admin run.
    let pendingQuery = supabase
      .from("payment_transactions")
      .select("*, invoice:invoices(id, invoice_number, status, tenant_id)")
      .eq("payment_status", "pending")
      .eq("payment_method", "bank_transfer");
    if (!isSuperAdmin)
      pendingQuery = pendingQuery.eq("tenant_id", callerTenantId);
    const { data: pendingPayments, error: queryError } = await pendingQuery;

    if (queryError) {
      console.error("Error querying pending payments:", queryError);
      throw queryError;
    }

    console.log(`Found ${pendingPayments?.length || 0} pending payments`);

    if (!pendingPayments || pendingPayments.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending payments to sync",
          matched: 0,
          pending: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Use the tolerance configured for each tenant instead of applying one
    // global amount window across unrelated hotels/accounts.
    const tenantIds = [
      ...new Set(
        (pendingPayments as PendingPayment[])
          .map((p) => p.tenant_id)
          .filter(Boolean),
      ),
    ];
    const { data: tenantSettings, error: tenantSettingsError } = await supabase
      .from("tenants")
      .select("id, payment_tolerance_vnd")
      .in("id", tenantIds);
    if (tenantSettingsError) throw tenantSettingsError;
    const toleranceByTenant = new Map(
      (tenantSettings ?? []).map((tenant) => {
        const value = Number(tenant.payment_tolerance_vnd);
        return [
          tenant.id,
          Number.isFinite(value) && value >= 0 ? value : DEFAULT_TOLERANCE_VND,
        ];
      }),
    );
    const toleranceFor = (tenantId: string | null | undefined) =>
      toleranceByTenant.get(tenantId ?? "") ?? DEFAULT_TOLERANCE_VND;

    // Multi-tenant deployments can have one active account per hotel. Never use
    // `.single()` here: it would fail as soon as a tenant has more than one hotel.
    let bankSettings: Array<{
      account_number: string;
      tenant_id: string | null;
      hotel_id: string | null;
    }> = [];
    if (isSuperAdmin) {
      const { data, error } = await supabase
        .from("bank_payment_settings")
        .select("account_number, tenant_id, hotel_id")
        .eq("is_active", true);
      if (error) throw error;
      bankSettings = data ?? [];
    } else {
      // Keep the legacy global account (tenant_id/hotel_id NULL) available for
      // tenant payments, while still preventing access to another tenant's
      // account-specific settings.
      const [tenantSettingsResult, globalSettingsResult] = await Promise.all([
        supabase
          .from("bank_payment_settings")
          .select("account_number, tenant_id, hotel_id")
          .eq("is_active", true)
          .eq("tenant_id", callerTenantId),
        supabase
          .from("bank_payment_settings")
          .select("account_number, tenant_id, hotel_id")
          .eq("is_active", true)
          .is("tenant_id", null)
          .is("hotel_id", null),
      ]);
      if (tenantSettingsResult.error) throw tenantSettingsResult.error;
      if (globalSettingsResult.error) throw globalSettingsResult.error;
      bankSettings = [
        ...(tenantSettingsResult.data ?? []),
        ...(globalSettingsResult.data ?? []),
      ];
    }

    if (!bankSettings || bankSettings.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No active bank payment settings found",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch and merge transactions for every allowed account.
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    const toDate = new Date();
    const transactionsById = new Map<string, SepayTransaction>();
    const accountTenantIds = new Map<string, Set<string>>();
    const globalAccountNumbers = new Set<string>();
    const fetchedAccountNumbers = new Set<string>();
    const settingHotelIds = bankSettings
      .map((setting) => setting.hotel_id)
      .filter((hotelId): hotelId is string => Boolean(hotelId));
    const { data: settingHotels, error: settingHotelsError } = settingHotelIds.length
      ? await supabase
          .from("hotels")
          .select("id, tenant_id")
          .in("id", settingHotelIds)
      : { data: [], error: null };
    if (settingHotelsError) throw settingHotelsError;
    const tenantByHotel = new Map(
      (settingHotels ?? []).map((hotel) => [hotel.id, hotel.tenant_id]),
    );
    const allowedAccountNumbers = new Set(
      bankSettings.map((setting) =>
        normalizeString(String(setting.account_number)),
      ),
    );
    for (const setting of bankSettings) {
      const accountNumber = String(setting.account_number).trim();
      const normalizedAccount = normalizeString(accountNumber);
      if (!normalizedAccount) continue;
      const tenantIdsForAccount =
        accountTenantIds.get(normalizedAccount) ?? new Set<string>();
      const settingTenantId =
        setting.tenant_id || tenantByHotel.get(setting.hotel_id);
      if (settingTenantId) {
        tenantIdsForAccount.add(settingTenantId);
      } else {
        globalAccountNumbers.add(normalizedAccount);
      }
      accountTenantIds.set(normalizedAccount, tenantIdsForAccount);
      if (fetchedAccountNumbers.has(normalizedAccount)) continue;
      fetchedAccountNumbers.add(normalizedAccount);

      const sepayUrl = new URL("https://my.sepay.vn/userapi/transactions/list");
      sepayUrl.searchParams.set("account_number", accountNumber);
      sepayUrl.searchParams.set(
        "transaction_date_min",
        fromDate.toISOString().split("T")[0],
      );
      sepayUrl.searchParams.set(
        "transaction_date_max",
        toDate.toISOString().split("T")[0],
      );
      sepayUrl.searchParams.set("limit", "100");
      console.log("Fetching SePay transactions from:", sepayUrl.toString());

      const sepayResponse = await fetch(sepayUrl.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SEPAY_API_KEY}`,
          "Content-Type": "application/json",
        },
      });
      if (!sepayResponse.ok) {
        const errorText = await sepayResponse.text();
        console.error("SePay API error:", sepayResponse.status, errorText);
        return new Response(
          JSON.stringify({
            success: false,
            error: `SePay API error: ${sepayResponse.status}`,
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const sepayData = await sepayResponse.json();
      if (!Array.isArray(sepayData?.transactions)) {
        console.error("SePay API returned an invalid transactions payload");
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid SePay API response",
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      for (const transaction of sepayData.transactions as SepayTransaction[]) {
        if (
          !Number.isSafeInteger(Number(transaction.id)) ||
          !Number.isFinite(Number(transaction.amount_in)) ||
          Number(transaction.amount_in) < 0
        ) {
          console.warn("Skipping malformed SePay transaction");
          continue;
        }
        const transactionWithAccount = {
          ...transaction,
          id: Number(transaction.id),
          amount_in: Number(transaction.amount_in),
          account_number: transaction.account_number || accountNumber,
        };
        const transactionKey = gatewayTransactionKey(
          transactionWithAccount.account_number,
          transactionWithAccount.id,
        );
        transactionsById.set(transactionKey, transactionWithAccount);
      }
    }
    const transactions: SepayTransaction[] = [...transactionsById.values()];

    console.log(`Fetched ${transactions.length} transactions from SePay`);

    // Only process incoming transactions (amount_in > 0)
    const incomingTransactions = transactions.filter((t) => t.amount_in > 0);
    console.log(`${incomingTransactions.length} incoming transactions`);

    let matchedCount = 0;
    const matchedPayments: string[] = [];
    const matchedSepayTxKeys = new Set<string>();
    const transactionKey = (transaction: SepayTransaction) =>
      gatewayTransactionKey(transaction.account_number || "unknown", transaction.id);
    const accountCanServeTenant = (accountNumber: string, tenantId: string) => {
      if (isSuperAdmin) return true;
      const normalizedAccount = normalizeString(accountNumber);
      return (
        globalAccountNumbers.has(normalizedAccount) ||
        accountTenantIds.get(normalizedAccount)?.has(tenantId) === true
      );
    };

    // Try to match each pending payment with SePay transactions
    for (const payment of pendingPayments as PendingPayment[]) {
      // A malformed cross-tenant invoice must never be used to authorize a
      // subscription update. Treat it as an anomaly instead of processing it.
      if (
        (payment.invoice_id && !payment.invoice) ||
        (payment.invoice && payment.invoice.tenant_id !== payment.tenant_id)
      ) {
        console.error(
          `Skipping payment ${payment.id}: missing or cross-tenant invoice`,
        );
        continue;
      }
      const invoiceNumber = payment.invoice?.invoice_number || "";
      const transactionRef = payment.transaction_reference || "";
      const normalizedInvoiceNum = normalizeString(invoiceNumber);
      const normalizedTransRef = normalizeString(transactionRef);

      console.log(`\nChecking payment ${payment.id}:`);
      console.log(`  Invoice: ${invoiceNumber} -> ${normalizedInvoiceNum}`);
      console.log(`  TransRef: ${transactionRef} -> ${normalizedTransRef}`);

      for (const sepayTx of incomingTransactions) {
        if (!allowedAccountNumbers.has(normalizeString(sepayTx.account_number)))
          continue;
        if (!accountCanServeTenant(sepayTx.account_number, payment.tenant_id))
          continue;
        if (matchedSepayTxKeys.has(transactionKey(sepayTx))) continue;
        const content = sepayTx.transaction_content || "";
        const normalizedContent = normalizeString(content);

        const invoiceMatch =
          normalizedInvoiceNum &&
          normalizedContent.includes(normalizedInvoiceNum);
        const transRefMatch =
          normalizedTransRef && normalizedContent.includes(normalizedTransRef);

        if (invoiceMatch || transRefMatch) {
          // Verify amount matches (with tolerance)
          const amountDiff = Math.abs(payment.amount - sepayTx.amount_in);

          const tolerance = toleranceFor(payment.tenant_id);
          if (amountDiff <= tolerance) {
            console.log(`  ✅ MATCHED with SePay tx ${sepayTx.id}`);
            console.log(`    Content: ${content}`);
            console.log(`    Amount: ${sepayTx.amount_in}`);

            // Claim the provider key and apply invoice/subscription changes in
            // one transaction. This shares the advisory-lock idempotency path
            // with the webhook worker.
            const gatewayKey = transactionKey(sepayTx);
            const { data: settlement, error: settlementError } =
              await supabase.rpc("settle_subscription_payment", {
                p_payment_id: payment.id,
                p_gateway_transaction_id: gatewayKey,
              });

            if (settlementError) {
              if (isPaymentConflict(settlementError)) {
                matchedSepayTxKeys.add(gatewayKey);
                continue;
              }
              console.error("Error settling payment:", settlementError);
              continue;
            }
            matchedSepayTxKeys.add(gatewayKey);
            console.log("  Settlement result:", settlement);

            // Create notification
            const tenantId = payment.tenant_id;
            const { data: tenantOwner } = await supabase
              .from("users")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("user_level_code", "tenant_owner")
              .limit(1)
              .maybeSingle();

            if (tenantOwner) {
              await supabase.from("in_app_notifications").insert({
                user_id: tenantOwner.id,
                tenant_id: tenantId,
                title: "Thanh toán đã được đồng bộ",
                body: `Đơn hàng ${invoiceNumber} đã được xác nhận thanh toán.`,
                type: "payment",
                action_url: "/settings/subscription",
                icon: "CheckCircle",
              });
            }

            matchedCount++;
            matchedPayments.push(invoiceNumber || transactionRef);
            break; // Move to next payment
          }
        }
      }
    }

    // ====== ANOMALY DETECTION (Sprint 3.1) ======
    // Find SePay transactions that didn't match any payment, or matched but with amount diff > tolerance.
    // Skip transactions older than 30 days to avoid backlog spam.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    let anomalyCount = 0;
    for (const tx of incomingTransactions) {
      if (matchedSepayTxKeys.has(transactionKey(tx))) continue;
      const txDate = tx.transaction_date ? new Date(tx.transaction_date) : null;
      if (txDate && txDate < cutoff) continue;

      // Try to find a partial match (invoice number in content, but amount is
      // outside that tenant's configured tolerance).
      const normalizedContent = normalizeString(tx.transaction_content || "");
      let partialMatch: PendingPayment | null = null;
      for (const p of pendingPayments as PendingPayment[]) {
        if (
          (p.invoice_id && !p.invoice) ||
          (p.invoice && p.invoice.tenant_id !== p.tenant_id)
        )
          continue;
        if (!isSuperAdmin && p.tenant_id !== callerTenantId) continue;
        if (!accountCanServeTenant(tx.account_number, p.tenant_id)) continue;
        const inv = normalizeString(p.invoice?.invoice_number || "");
        const ref = normalizeString(p.transaction_reference || "");
        const amountDiff = Math.abs(tx.amount_in - p.amount);
        if (
          ((inv && normalizedContent.includes(inv)) ||
            (ref && normalizedContent.includes(ref))) &&
          amountDiff > toleranceFor(p.tenant_id)
        ) {
          partialMatch = p;
          break;
        }
      }

      const anomalyType = partialMatch ? "amount_mismatch" : "unmatched";
      const normalizedAccount = normalizeString(tx.account_number);
      const accountTenants = accountTenantIds.get(normalizedAccount);
      const isGlobalAccount = globalAccountNumbers.has(normalizedAccount);
      const isAmbiguousAccount =
        isGlobalAccount || (accountTenants?.size ?? 0) !== 1;

      // A global account mixes transfers from multiple tenants. A tenant owner
      // may use it to match their own references, but must not see or claim
      // otherwise-unmatched transfers that could belong to another tenant.
      if (!isSuperAdmin && !partialMatch && isAmbiguousAccount) continue;

      const tenantId =
        partialMatch?.tenant_id ||
        (!isSuperAdmin
          ? callerTenantId
          : accountTenants?.size === 1
            ? [...accountTenants][0]
            : null);

      const { error: anomalyErr } = await supabase
        .from("payment_anomalies")
        .upsert(
          {
            tenant_id: tenantId,
            anomaly_type: anomalyType,
            sepay_tx_id: transactionKey(tx),
            sepay_reference: tx.reference_number,
            sepay_content: tx.transaction_content,
            sepay_amount: tx.amount_in,
            sepay_date: tx.transaction_date,
            sepay_account: tx.account_number,
            expected_payment_id: partialMatch?.id || null,
            expected_invoice_number:
              partialMatch?.invoice?.invoice_number || null,
            expected_amount: partialMatch?.amount || null,
            amount_diff: partialMatch
              ? tx.amount_in - partialMatch.amount
              : null,
          },
          { onConflict: "sepay_tx_id,anomaly_type", ignoreDuplicates: false },
        );
      if (!anomalyErr) anomalyCount++;
    }
    console.log(`Logged ${anomalyCount} anomalies`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${matchedCount} payment(s), ${anomalyCount} anomalies`,
        matched: matchedCount,
        matchedInvoices: matchedPayments,
        pending: pendingPayments.length - matchedCount,
        anomalies: anomalyCount,
        totalTransactions: isSuperAdmin
          ? incomingTransactions.length
          : matchedCount + anomalyCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Sync error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
