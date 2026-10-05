import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, getUserScope, jsonResult, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_rooms",
  title: "Danh sách phòng",
  description:
    "Liệt kê phòng cùng trạng thái hiện tại (trống, đang ở, cần dọn, bảo trì...). Có thể lọc theo khách sạn, trạng thái hoặc tầng.",
  inputSchema: {
    hotel_id: z.string().uuid().optional().describe("ID khách sạn cần lọc."),
    status: z.string().optional().describe("Trạng thái phòng cần lọc, ví dụ available, occupied, dirty, cleaning."),
    floor: z.number().int().optional().describe("Số tầng cần lọc."),
    limit: z.number().int().min(1).max(200).default(50).describe("Số bản ghi tối đa."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ hotel_id, status, floor, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    try {
      const { supabase, tenantId } = await getUserScope(ctx);
      let query = supabase
        .from("rooms")
        .select("id, room_number, floor, room_type, status, base_price, hotel_id, notes")
        .eq("tenant_id", tenantId)
        .order("floor")
        .order("room_number")
        .limit(limit ?? 50);
      if (hotel_id) query = query.eq("hotel_id", hotel_id);
      if (status) query = query.eq("status", status);
      if (typeof floor === "number") query = query.eq("floor", floor);
      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return jsonResult(data ?? []);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : "Lỗi không xác định");
    }
  },
});
