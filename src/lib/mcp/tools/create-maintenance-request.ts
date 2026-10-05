import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, getUserScope, jsonResult, unauthenticated } from "../supabase";

export default defineTool({
  name: "create_maintenance_request",
  title: "Tạo yêu cầu bảo trì",
  description:
    "Tạo một yêu cầu bảo trì mới cho khách sạn của người dùng. Chỉ tạo khi người dùng yêu cầu rõ ràng.",
  inputSchema: {
    title: z.string().trim().min(3).describe("Tiêu đề ngắn gọn của sự cố."),
    description: z.string().trim().min(3).describe("Mô tả chi tiết sự cố."),
    location: z.string().trim().min(1).describe("Vị trí xảy ra sự cố, ví dụ 'Phòng 201' hoặc 'Sảnh tầng 1'."),
    issue_type: z
      .enum(["repair", "replace", "inspection", "cleaning", "other"])
      .default("repair")
      .describe("Loại sự cố."),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium").describe("Mức ưu tiên."),
    hotel_id: z.string().uuid().optional().describe("ID khách sạn; mặc định lấy khách sạn của người dùng."),
    room_id: z.string().uuid().optional().describe("ID phòng liên quan (nếu có)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    try {
      const { supabase, tenantId, hotelId } = await getUserScope(ctx);
      const targetHotel = input.hotel_id ?? hotelId;
      if (!targetHotel) return errorResult("Không xác định được khách sạn. Hãy truyền hotel_id.");

      const requestCode = `MR-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase
        .from("maintenance_requests")
        .insert({
          tenant_id: tenantId,
          hotel_id: targetHotel,
          room_id: input.room_id ?? null,
          request_code: requestCode,
          title: input.title,
          description: input.description,
          location: input.location,
          issue_type: input.issue_type,
          priority: input.priority,
          reported_by: ctx.getUserId()!,
        })
        .select("id, request_code, title, status, priority, created_at")
        .maybeSingle();
      if (error) return errorResult(error.message);
      return jsonResult(data);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : "Lỗi không xác định");
    }
  },
});
