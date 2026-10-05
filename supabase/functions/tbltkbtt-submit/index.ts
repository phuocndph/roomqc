// Edge Function: tbltkbtt-submit
// Mục đích: Quét hàng đợi guest_stay_registrations (pending/failed) và gửi lên hệ thống
// Khai báo lưu trú của Bộ Công an theo cấu hình từng khách sạn (hotels.tbltkbtt_config).
//
// Cấu hình mỗi hotel (jsonb hotels.tbltkbtt_config):
// {
//   "enabled": true,
//   "endpoint_url": "https://tbltkbtt.gov.vn/api/...",
//   "account": "...",
//   "token": "...",
//   "establishment_code": "...",
//   "mode": "live" | "dry_run"   // dry_run = không POST, chỉ đánh dấu submitted
// }
//
// Chạy theo cron mỗi 2 phút (pg_cron + pg_net).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;
// Backoff: 2^attempt minutes (2, 4, 8, 16, 32)
const backoffMs = (attempt: number) =>
  Math.min(2 ** Math.max(attempt, 0), 32) * 60_000;

interface Reg {
  id: string;
  tenant_id: string;
  hotel_id: string;
  booking_id: string | null;
  guest_id: string;
  room_number: string;
  check_in_at: string;
  check_out_at: string | null;
  purpose: string | null;
  status: string;
  attempt_count: number;
}

interface HotelCfg {
  id: string;
  tbltkbtt_config: {
    enabled?: boolean;
    endpoint_url?: string;
    account?: string;
    token?: string;
    establishment_code?: string;
    mode?: "live" | "dry_run";
  } | null;
}

function buildPayload(reg: Reg, guest: any, cfg: HotelCfg["tbltkbtt_config"]) {
  // Schema gần đúng theo tbltkbtt.gov.vn (mỗi tỉnh có thể khác chi tiết).
  return {
    establishment_code: cfg?.establishment_code ?? null,
    guest: {
      full_name: guest?.full_name ?? null,
      gender: guest?.gender ?? null,
      birth_date: guest?.birth_date ?? null,
      nationality: guest?.nationality ?? "VN",
      id_type: guest?.id_type ?? "cccd",
      id_number: guest?.id_number ?? null,
      id_issue_date: guest?.id_issue_date ?? null,
      id_issue_place: guest?.id_issue_place ?? null,
      ethnicity: guest?.ethnicity ?? null,
      religion: guest?.religion ?? null,
      occupation: guest?.occupation ?? null,
      permanent_address: guest?.permanent_address ?? guest?.address ?? null,
      phone: guest?.phone ?? null,
      // Khách nước ngoài
      visa_number: guest?.visa_number ?? null,
      visa_expiry: guest?.visa_expiry ?? null,
      entry_date: guest?.entry_date ?? null,
      entry_port: guest?.entry_port ?? null,
    },
    stay: {
      room_number: reg.room_number,
      check_in_at: reg.check_in_at,
      check_out_at: reg.check_out_at,
      purpose: reg.purpose ?? "Du lịch",
    },
    external_ref: reg.id,
  };
}

async function processOne(
  supabase: any,
  reg: Reg,
  guest: any,
  hotel: HotelCfg,
): Promise<{ ok: boolean; error?: string; external_ref?: string }> {
  const cfg = hotel.tbltkbtt_config ?? {};
  if (!cfg.enabled || !cfg.endpoint_url) {
    return { ok: false, error: "HOTEL_NOT_CONFIGURED" };
  }

  const payload = buildPayload(reg, guest, cfg);

  // Dry-run: không gọi external, chỉ đánh dấu submitted
  if (cfg.mode === "dry_run") {
    return { ok: true, external_ref: `DRYRUN-${reg.id.slice(0, 8)}` };
  }

  try {
    const resp = await fetch(cfg.endpoint_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await resp.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }

    if (!resp.ok) {
      return { ok: false, error: `HTTP_${resp.status}: ${text.slice(0, 300)}` };
    }
    const externalRef =
      body?.external_ref ?? body?.ref ?? body?.id ?? body?.data?.id ?? null;
    return { ok: true, external_ref: externalRef };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date().toISOString();

  // Lấy batch pending/failed đến hạn retry
  const { data: regs, error } = await supabase
    .from("guest_stay_registrations")
    .select("*")
    .in("status", ["pending", "failed"])
    .lt("attempt_count", MAX_ATTEMPTS)
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[tbltkbtt-submit] fetch error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!regs || regs.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Preload guests & hotels
  const guestIds = [...new Set(regs.map((r: any) => r.guest_id))];
  const hotelIds = [...new Set(regs.map((r: any) => r.hotel_id))];

  const [{ data: guests }, { data: hotels }] = await Promise.all([
    supabase.from("guests").select("*").in("id", guestIds),
    supabase.from("hotels").select("id, tbltkbtt_config").in("id", hotelIds),
  ]);

  const guestMap = new Map<string, any>((guests ?? []).map((g: any) => [g.id, g]));
  const hotelMap = new Map<string, HotelCfg>(
    (hotels ?? []).map((h: any) => [h.id, h as HotelCfg]),
  );

  const result = { processed: 0, submitted: 0, failed: 0, skipped: 0 };

  for (const reg of regs as Reg[]) {
    result.processed++;
    const hotel = hotelMap.get(reg.hotel_id);
    const guest = guestMap.get(reg.guest_id);

    if (!hotel || !hotel.tbltkbtt_config?.enabled) {
      result.skipped++;
      continue;
    }

    // Lock-ish: chuyển sang submitting trước khi POST
    await supabase
      .from("guest_stay_registrations")
      .update({ status: "submitting", updated_at: new Date().toISOString() })
      .eq("id", reg.id)
      .eq("status", reg.status);

    const r = await processOne(supabase, reg, guest, hotel);
    const attempt = (reg.attempt_count ?? 0) + 1;

    if (r.ok) {
      await supabase
        .from("guest_stay_registrations")
        .update({
          status: "submitted",
          external_ref: r.external_ref ?? null,
          submitted_at: new Date().toISOString(),
          attempt_count: attempt,
          last_error: null,
          payload: buildPayload(reg, guest, hotel.tbltkbtt_config),
          next_retry_at: null,
        })
        .eq("id", reg.id);
      result.submitted++;
    } else {
      const isFinal = attempt >= MAX_ATTEMPTS;
      await supabase
        .from("guest_stay_registrations")
        .update({
          status: "failed",
          attempt_count: attempt,
          last_error: r.error ?? "UNKNOWN_ERROR",
          next_retry_at: isFinal
            ? null
            : new Date(Date.now() + backoffMs(attempt)).toISOString(),
        })
        .eq("id", reg.id);
      result.failed++;
    }
  }

  console.log("[tbltkbtt-submit]", JSON.stringify(result));
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
