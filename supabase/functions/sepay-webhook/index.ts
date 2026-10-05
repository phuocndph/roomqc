import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Normalize string: remove special characters and convert to uppercase
// This helps match "HDMJX15ZZB" with "HD-MJX15ZZB"
function normalizeString(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function gatewayTransactionKey(accountNumber: string, transactionId: number) {
  return `${normalizeString(accountNumber)}:${transactionId}`;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

// B7: Rate limit in-memory per IP (60 req/phút). Đủ cho SePay (vài req/giây tối đa).
// Lưu ý: in-memory = scoped per edge instance; nếu cần stricter dùng Redis/DB.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const ipHits = new Map<string, number[]>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (arr.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, arr);
    return false;
  }
  arr.push(now);
  ipHits.set(ip, arr);
  // Cleanup occasional: nếu Map > 1000 IP → xoá entries cũ
  if (ipHits.size > 1000) {
    for (const [k, v] of ipHits.entries()) {
      if (v.every((t) => now - t > RATE_LIMIT_WINDOW_MS)) ipHits.delete(k);
    }
  }
  return true;
}

// Phase 1 — Lượt 2: đọc payment_tolerance_vnd theo tenant.
// Cache trong process để tránh query lặp khi xử lý nhiều payment cùng webhook.
const TOLERANCE_FALLBACK_VND = 1000;
const toleranceCache = new Map<string, number>();
function toSafeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
async function getTenantTolerance(
  supabase: any,
  tenantId: string | null | undefined,
): Promise<number> {
  if (!tenantId) return TOLERANCE_FALLBACK_VND;
  if (toleranceCache.has(tenantId)) return toleranceCache.get(tenantId)!;
  try {
    const { data } = await supabase
      .from("tenants")
      .select("payment_tolerance_vnd")
      .eq("id", tenantId)
      .maybeSingle();
    const v = Number(data?.payment_tolerance_vnd ?? TOLERANCE_FALLBACK_VND);
    const tol = Number.isFinite(v) && v >= 0 ? v : TOLERANCE_FALLBACK_VND;
    toleranceCache.set(tenantId, tol);
    return tol;
  } catch {
    return TOLERANCE_FALLBACK_VND;
  }
}

interface SepayWebhookPayload {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  subAccount: string | null;
  code: string | null;
  content: string;
  transferType: "in" | "out";
  description: string;
  transferAmount: number;
  referenceCode: string;
  accumulated: number;
}

function parseSepayWebhookPayload(value: unknown): SepayWebhookPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const id = toSafeInteger(raw.id);
  const accountNumber =
    typeof raw.accountNumber === "string" ? raw.accountNumber.trim() : "";
  const transferAmount =
    typeof raw.transferAmount === "number"
      ? raw.transferAmount
      : typeof raw.transferAmount === "string" && raw.transferAmount.trim()
        ? Number(raw.transferAmount)
        : Number.NaN;
  const transferType = raw.transferType;

  if (
    id === null ||
    id <= 0 ||
    !accountNumber ||
    !Number.isFinite(transferAmount) ||
    transferAmount < 0 ||
    (transferType !== "in" && transferType !== "out")
  ) {
    return null;
  }

  const nullableString = (input: unknown) =>
    typeof input === "string" && input.length > 0 ? input : null;
  const requiredString = (input: unknown) =>
    typeof input === "string" ? input : "";
  const accumulated = Number(raw.accumulated);

  return {
    id,
    gateway: requiredString(raw.gateway),
    transactionDate: requiredString(raw.transactionDate),
    accountNumber,
    subAccount: nullableString(raw.subAccount),
    code: nullableString(raw.code),
    content: requiredString(raw.content),
    transferType,
    description: requiredString(raw.description),
    transferAmount,
    referenceCode: requiredString(raw.referenceCode),
    accumulated: Number.isFinite(accumulated) ? accumulated : 0,
  };
}

// Log webhook attempt to database for audit trail
async function logWebhookAttempt(
  supabase: any,
  payload: SepayWebhookPayload | null,
  status: "success" | "failed" | "rejected",
  message: string,
  matchedPaymentId?: string,
) {
  try {
    const now = new Date().toISOString();
    const eventId = payload
      ? gatewayTransactionKey(payload.accountNumber, payload.id)
      : null;
    // payment_webhook_logs uses the original gateway/event schema. Keep the
    // audit write aligned with that table instead of silently dropping logs
    // because of columns from an older prototype schema.
    const record = {
      gateway: "sepay",
      event_type: status,
      event_id: eventId,
      payload: {
        ...(payload ?? {}),
        _roomqc: { message, matched_payment_id: matchedPaymentId ?? null },
      },
      processed: status === "success",
      processed_at: status === "success" ? now : null,
      error: status === "success" ? null : message,
      created_at: now,
    };
    const result = eventId
      ? await supabase
          .from("payment_webhook_logs")
          .upsert(record, { onConflict: "gateway,event_id" })
      : await supabase.from("payment_webhook_logs").insert(record);
    if (result.error) throw result.error;
  } catch (err) {
    console.error("Failed to log webhook attempt:", err);
  }
}

Deno.serve(async (req) => {
  console.log("=== SePay Webhook Request Received ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);

  // Log headers for debugging
  const headersObj: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headersObj[key] =
      key.toLowerCase() === "authorization" ? "[REDACTED]" : value;
  });
  console.log("Headers:", JSON.stringify(headersObj));

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

  // B7: rate limit + IP allowlist (in-memory, per edge instance).
  // - Mặc định cho phép tất cả; nếu env SEPAY_ALLOWED_IPS được set (CSV) thì enforce.
  // - Rate: tối đa 60 req/IP/phút. Vượt → 429.
  const clientIp =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const SEPAY_ALLOWED_IPS = Deno.env.get("SEPAY_ALLOWED_IPS");
  if (SEPAY_ALLOWED_IPS) {
    const allowList = SEPAY_ALLOWED_IPS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowList.length > 0 && !allowList.includes(clientIp)) {
      console.log(`REJECTED: IP ${clientIp} không nằm trong SEPAY_ALLOWED_IPS`);
      return new Response(
        JSON.stringify({ success: false, error: "IP not allowed" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  if (!checkRateLimit(clientIp)) {
    console.log(`REJECTED: rate limit exceeded for IP ${clientIp}`);
    return new Response(
      JSON.stringify({ success: false, error: "Too many requests" }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env
    .get("SUPABASE_SERVICE_ROLE_KEY")
    ?.trim();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { success: false, error: "Supabase integration is not configured" },
      503,
    );
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // B3 (fail-close): SEPAY_API_KEY là BẮT BUỘC. Không cấu hình = từ chối thẳng.
    // Trước đây cho phép fail-open khi thiếu secret → rủi ro giả lập chuyển khoản.
    const SEPAY_API_KEY = Deno.env.get("SEPAY_API_KEY")?.trim();
    const authHeader = req.headers.get("Authorization");

    if (!SEPAY_API_KEY) {
      console.error(
        "REJECTED: SEPAY_API_KEY chưa cấu hình. Webhook bị khóa cứng để chặn giả lập.",
      );
      await logWebhookAttempt(
        supabase,
        null,
        "rejected",
        "SEPAY_API_KEY not configured (fail-close)",
      );
      return jsonResponse(
        { success: false, error: "Webhook not configured" },
        503,
      );
    }

    if (!authHeader) {
      console.log("REJECTED: Thiếu Authorization header");
      await logWebhookAttempt(
        supabase,
        null,
        "rejected",
        "Missing Authorization header",
      );
      return jsonResponse(
        { success: false, error: "Authentication required" },
        401,
      );
    }

    const authMatch = authHeader.match(/^\s*(?:apikey|bearer)\s+(.+?)\s*$/i);
    const providedKey = authMatch?.[1] ?? "";
    if (providedKey !== SEPAY_API_KEY) {
      console.log("REJECTED: API key không khớp");
      await logWebhookAttempt(supabase, null, "rejected", "Invalid API key");
      return jsonResponse({ success: false, error: "Invalid API key" }, 401);
    }
    console.log("API key verified");

    // Parse request body
    let payload: SepayWebhookPayload | null;
    try {
      const rawBody = await req.text();
      payload = parseSepayWebhookPayload(JSON.parse(rawBody));
    } catch (parseError) {
      console.error("Failed to parse JSON body:", parseError);
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }
    if (!payload) {
      return jsonResponse(
        { success: false, error: "Invalid SePay payload" },
        400,
      );
    }
    console.log(
      `Received SePay transaction ${payload.id} for account ${normalizeString(payload.accountNumber)}`,
    );

    // Only process incoming transfers
    if (payload.transferType !== "in") {
      console.log("Ignoring outgoing transfer");
      await logWebhookAttempt(
        supabase,
        payload,
        "success",
        "Ignored outgoing transfer",
      );
      return jsonResponse({ success: true, message: "Ignored outgoing transfer" });
    }

    // Only accept transfers that arrived on an account configured for RoomQC.
    // This prevents a valid webhook secret from confirming a payment from an
    // unrelated bank account.
    const normalizedAccountNumber = normalizeString(
      payload.accountNumber || "",
    );
    const { data: activeBankSettings, error: bankSettingsError } =
      await supabase
        .from("bank_payment_settings")
        .select("account_number, tenant_id, hotel_id")
        .eq("is_active", true);
    if (bankSettingsError) throw bankSettingsError;
    const accountTenantIds = new Map<string, Set<string>>();
    const globalAccountNumbers = new Set<string>();
    const hotelIds = (activeBankSettings || [])
      .map((setting) => setting.hotel_id)
      .filter((hotelId): hotelId is string => Boolean(hotelId));
    const { data: settingHotels, error: settingHotelsError } = hotelIds.length
      ? await supabase.from("hotels").select("id, tenant_id").in("id", hotelIds)
      : { data: [], error: null };
    if (settingHotelsError) throw settingHotelsError;
    const tenantByHotel = new Map(
      (settingHotels || []).map((hotel) => [hotel.id, hotel.tenant_id]),
    );
    for (const setting of activeBankSettings || []) {
      const account = normalizeString(String(setting.account_number || ""));
      if (!account) continue;
      const tenantId = setting.tenant_id || tenantByHotel.get(setting.hotel_id);
      if (!tenantId) {
        globalAccountNumbers.add(account);
        continue;
      }
      const tenants = accountTenantIds.get(account) ?? new Set<string>();
      tenants.add(tenantId);
      accountTenantIds.set(account, tenants);
    }
    const configuredAccounts = new Set([
      ...globalAccountNumbers,
      ...accountTenantIds.keys(),
    ]);
    if (
      !normalizedAccountNumber ||
      !configuredAccounts.has(normalizedAccountNumber)
    ) {
      console.log(
        `REJECTED: account ${payload.accountNumber || "[missing]"} is not configured`,
      );
      await logWebhookAttempt(
        supabase,
        payload,
        "rejected",
        "Unconfigured bank account",
      );
      return jsonResponse(
        { success: false, error: "Unconfigured bank account" },
        403,
      );
    }

    const gatewayTransactionId = gatewayTransactionKey(
      payload.accountNumber,
      payload.id,
    );
    const [existingSubscriptionPayment, existingBookingPayment] =
      await Promise.all([
        supabase
          .from("payment_transactions")
          .select("id, payment_status")
          .eq("gateway_transaction_id", gatewayTransactionId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("booking_payments")
          .select("id, payment_status")
          .eq("gateway_transaction_id", gatewayTransactionId)
          .limit(1)
          .maybeSingle(),
      ]);
    if (existingSubscriptionPayment.error) {
      throw existingSubscriptionPayment.error;
    }
    if (existingBookingPayment.error) throw existingBookingPayment.error;
    if (existingSubscriptionPayment.data || existingBookingPayment.data) {
      await logWebhookAttempt(
        supabase,
        payload,
        "success",
        "Payment already processed for this SePay transaction",
        existingSubscriptionPayment.data?.id || existingBookingPayment.data?.id,
      );
      return jsonResponse({
        success: true,
        message: "Payment already processed",
        gatewayTransactionId,
      });
    }

    const accountCanServeTenant = (tenantId: string | null | undefined) =>
      Boolean(
        tenantId &&
          (globalAccountNumbers.has(normalizedAccountNumber) ||
            accountTenantIds.get(normalizedAccountNumber)?.has(tenantId)),
      );

    // supabase client already created above

    // Extract invoice number from content (format: HD-XXXXXX or similar)
    const content = payload.content || payload.description || "";
    console.log("Transaction content:", content);

    // Try to find matching pending payment by transaction_reference
    // The transaction_reference is stored when creating the invoice
    const { data: pendingPayments, error: queryError } = await supabase
      .from("payment_transactions")
      .select(
        `
        *,
        invoice:invoices(id, invoice_number, status, tenant_id, notes)
      `,
      )
      .eq("payment_status", "pending")
      .eq("payment_method", "bank_transfer");

    if (queryError) {
      console.error("Error querying pending payments:", queryError);
      throw queryError;
    }

    console.log(`Found ${pendingPayments?.length || 0} pending payments`);

    // Find matching payment by checking if content contains the invoice number or transaction reference
    // Normalize strings to handle banks removing special characters (e.g., "HD-MJX15ZZB" -> "HDMJX15ZZB")
    let matchedPayment = null;
    const normalizedContent = normalizeString(content);
    console.log("Normalized content:", normalizedContent);

    for (const payment of pendingPayments || []) {
      if (!accountCanServeTenant(payment.tenant_id)) continue;
      if (
        (payment.invoice_id && !payment.invoice) ||
        (payment.invoice && payment.invoice.tenant_id !== payment.tenant_id)
      ) {
        console.error(
          `Skipping malformed payment ${payment.id}: invoice tenant mismatch`,
        );
        continue;
      }
      const invoiceNumber = payment.invoice?.invoice_number || "";
      const transactionRef = payment.transaction_reference || "";
      const normalizedInvoiceNum = normalizeString(invoiceNumber);
      const normalizedTransRef = normalizeString(transactionRef);

      console.log(`Checking payment ${payment.id}:`);
      console.log(
        `  - Invoice: "${invoiceNumber}" -> normalized: "${normalizedInvoiceNum}"`,
      );
      console.log(
        `  - TransRef: "${transactionRef}" -> normalized: "${normalizedTransRef}"`,
      );
      console.log(`  - Content normalized: "${normalizedContent}"`);

      // Check if the normalized transfer content contains the normalized invoice number or transaction reference
      const invoiceMatch =
        normalizedInvoiceNum &&
        normalizedContent.includes(normalizedInvoiceNum);
      const transRefMatch =
        normalizedTransRef && normalizedContent.includes(normalizedTransRef);

      console.log(
        `  - Invoice match: ${invoiceMatch}, TransRef match: ${transRefMatch}`,
      );

      if (invoiceMatch || transRefMatch) {
        // Verify amount matches (tolerance theo tenant — Phase 1)
        const tenantId = payment.tenant_id || null;
        const tolerance = await getTenantTolerance(supabase, tenantId);
        const amountDiff = Math.abs(payment.amount - payload.transferAmount);
        console.log(
          `  - Amount check: expected ${payment.amount}, got ${payload.transferAmount}, diff: ${amountDiff}, tolerance: ${tolerance}`,
        );

        if (amountDiff <= tolerance) {
          console.log(`  - ✅ MATCHED!`);
          matchedPayment = payment;
          break;
        } else {
          console.log(`  - ❌ Amount mismatch (diff > ${tolerance} VND)`);
        }
      } else {
        console.log(`  - ❌ No content match`);
      }
    }

    // If no matching payment_transaction, try booking_payments
    if (!matchedPayment) {
      console.log(
        "No matching payment_transaction, trying booking_payments...",
      );

      // Query pending booking payments
      const { data: bookingPayments, error: bookingQueryError } = await supabase
        .from("booking_payments")
        .select(
          `
          *,
          booking:room_bookings(id, total_amount, amount_paid, guest_name, tenant_id)
        `,
        )
        .eq("payment_status", "pending")
        .eq("payment_method", "bank_transfer");

      if (bookingQueryError) {
        console.error("Error querying booking payments:", bookingQueryError);
      } else {
        console.log(
          `Found ${bookingPayments?.length || 0} pending booking payments`,
        );

        for (const bp of bookingPayments || []) {
          if (!accountCanServeTenant(bp.tenant_id || bp.booking?.tenant_id)) {
            continue;
          }
          if (bp.booking_id && !bp.booking) {
            console.error(
              `Skipping malformed booking payment ${bp.id}: booking not found`,
            );
            continue;
          }
          if (
            !bp.booking ||
            bp.booking.tenant_id !== bp.tenant_id ||
            bp.booking.id !== bp.booking_id
          ) {
            console.error(
              `Skipping malformed booking payment ${bp.id}: booking tenant/id mismatch`,
            );
            continue;
          }
          const transRef = bp.transaction_reference || "";
          const normalizedTransRef = normalizeString(transRef);

          console.log(`Checking booking payment ${bp.id}:`);
          console.log(
            `  - TransRef: "${transRef}" -> normalized: "${normalizedTransRef}"`,
          );

          if (
            normalizedTransRef &&
            normalizedContent.includes(normalizedTransRef)
          ) {
            const tenantId = bp.booking?.tenant_id || null;
            if (!tenantId) continue;
            const tolerance = await getTenantTolerance(supabase, tenantId);
            const amountDiff = Math.abs(bp.amount - payload.transferAmount);
            console.log(
              `  - Amount check: expected ${bp.amount}, got ${payload.transferAmount}, diff: ${amountDiff}, tolerance: ${tolerance}`,
            );

            if (amountDiff <= tolerance) {
              console.log(`  - ✅ MATCHED BOOKING PAYMENT!`);

              // Claim, distribute (including group payments), and mark the
              // parent payment complete in one database transaction. This
              // prevents a retry from leaving a partially settled group.
              const { data: settlement, error: settlementError } =
                await supabase.rpc("settle_booking_payment", {
                  p_payment_id: bp.id,
                  p_gateway_transaction_id: gatewayTransactionId,
                });

              if (settlementError) {
                if (isPaymentConflict(settlementError)) {
                  await logWebhookAttempt(
                    supabase,
                    payload,
                    "success",
                    "Booking payment already processed",
                    bp.id,
                  );
                  return jsonResponse({
                    success: true,
                    message: "Payment already processed",
                    gatewayTransactionId,
                  });
                }
                console.error("Error settling booking payment:", settlementError);
                throw settlementError;
              }

              console.log("Booking payment processed successfully", settlement);
              await logWebhookAttempt(
                supabase,
                payload,
                "success",
                `Booking payment confirmed: ${bp.transaction_reference}`,
                bp.id,
              );

              return new Response(
                JSON.stringify({
                  success: true,
                  message: "Booking payment confirmed",
                  transactionReference: bp.transaction_reference,
                  amount: payload.transferAmount,
                }),
                {
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          }
        }
      }
    }

    if (!matchedPayment) {
      console.log("No matching pending payment found for content:", content);
      console.log("Normalized content was:", normalizedContent);

      // Log no match for audit trail
      await logWebhookAttempt(
        supabase,
        payload,
        "failed",
        `No matching pending payment found. Content: ${content}, Amount: ${payload.transferAmount}`,
      );

      return jsonResponse({
        success: true,
        message: "No matching pending payment found",
        amount: payload.transferAmount,
      });
    }

    console.log(
      `Matched payment: ${matchedPayment.id} for invoice: ${matchedPayment.invoice?.invoice_number}`,
    );

    // Claim the payment, invoice, and subscription update atomically. The
    // notification below is intentionally best-effort and never controls the
    // financial commit.
    const { data: settlement, error: settlementError } = await supabase.rpc(
      "settle_subscription_payment",
      {
        p_payment_id: matchedPayment.id,
        p_gateway_transaction_id: gatewayTransactionId,
      },
    );
    if (settlementError) {
      if (isPaymentConflict(settlementError)) {
        await logWebhookAttempt(
          supabase,
          payload,
          "success",
          "Subscription payment already processed",
          matchedPayment.id,
        );
        return jsonResponse({
          success: true,
          message: "Payment already processed",
          gatewayTransactionId,
        });
      }
      console.error("Error settling subscription payment:", settlementError);
      throw settlementError;
    }
    console.log("Subscription payment settled", settlement);

    const tenantId = matchedPayment.tenant_id;

    // Create in-app notification for tenant owner
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
        title: "Thanh toán thành công",
        body: `Đơn hàng ${matchedPayment.invoice?.invoice_number || matchedPayment.id} đã được xác nhận thanh toán tự động.`,
        type: "payment",
        action_url: "/settings/subscription",
        icon: "CheckCircle",
      });
    }

    console.log("Payment processed successfully");

    // Log success for audit trail
    await logWebhookAttempt(
      supabase,
      payload,
      "success",
      `Payment confirmed for invoice ${matchedPayment.invoice?.invoice_number}`,
      matchedPayment.id,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment confirmed",
        invoiceNumber: matchedPayment.invoice?.invoice_number,
        amount: payload.transferAmount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Webhook error:", error);
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
