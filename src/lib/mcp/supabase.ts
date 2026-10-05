import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

/**
 * Supabase client chạy dưới danh tính của user đã xác thực qua OAuth.
 * Forward raw access token để RLS áp dụng đúng theo user.
 */
export function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function unauthenticated() {
  return {
    content: [{ type: "text" as const, text: "Chưa xác thực. Hãy kết nối lại tài khoản." }],
    isError: true,
  };
}

export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: { data } as Record<string, unknown>,
  };
}

/** Lấy tenant_id của user hiện tại (bắt buộc filter mọi query theo tenant). */
export async function getUserScope(ctx: ToolContext) {
  const supabase = supabaseForUser(ctx);
  const { data, error } = await supabase
    .from("users")
    .select("tenant_id, hotel_id, full_name")
    .eq("id", ctx.getUserId()!)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.tenant_id) throw new Error("Tài khoản chưa gắn với đơn vị (tenant) nào.");
  return { supabase, tenantId: data.tenant_id as string, hotelId: data.hotel_id as string | null, fullName: data.full_name as string | null };
}
