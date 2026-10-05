import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, getUserScope, jsonResult, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_bookings",
  title: "Danh sách đặt phòng",
  description:
    "Liệt kê đặt phòng theo khoảng ngày nhận phòng, trạng thái hoặc khách sạn. Dùng để xem lịch nhận/trả phòng.",
  inputSchema: {
    hotel_id: z.string().uuid().optional().describe("ID khách sạn cần lọc."),
    status: z.string().optional().describe("Trạng thái đặt phòng, ví dụ confirmed, checked_in, checked_out, cancelled."),
    from_date: z.string().optional().describe("Ngày nhận phòng từ (YYYY-MM-DD)."),
    to_date: z.string().optional().describe("Ngày nhận phòng đến (YYYY-MM-DD)."),
    limit: z.number().int().min(1).max(200).default(50).describe("Số bản ghi tối đa."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ hotel_id, status, from_date, to_date, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    try {
      const { supabase, tenantId } = await getUserScope(ctx);
      let query = supabase
        .from("room_bookings")
        .select(
          "id, booking_reference, guest_name, guest_phone, booking_type, status, payment_status, check_in_date, check_out_date, total_amount, amount_paid, deposit_amount, room_id, hotel_id",
        )
        .eq("tenant_id", tenantId)
        .order("check_in_date", { ascending: false })
        .limit(limit ?? 50);
      if (hotel_id) query = query.eq("hotel_id", hotel_id);
      if (status) query = query.eq("status", status);
      if (from_date) query = query.gte("check_in_date", from_date);
      if (to_date) query = query.lte("check_in_date", to_date);
      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return jsonResult(data ?? []);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : "Lỗi không xác định");
    }
  },
});
