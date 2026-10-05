import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, getUserScope, jsonResult, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_housekeeping_tasks",
  title: "Danh sách công việc buồng phòng",
  description:
    "Liệt kê công việc buồng phòng (dọn phòng, QC, bổ sung đồ) theo trạng thái, khách sạn hoặc chỉ công việc của tôi.",
  inputSchema: {
    hotel_id: z.string().uuid().optional().describe("ID khách sạn cần lọc."),
    status: z.string().optional().describe("Trạng thái công việc, ví dụ pending, in_progress, awaiting_review, completed."),
    only_mine: z.boolean().default(false).describe("Chỉ lấy công việc được giao cho tôi."),
    limit: z.number().int().min(1).max(200).default(50).describe("Số bản ghi tối đa."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ hotel_id, status, only_mine, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    try {
      const { supabase, tenantId } = await getUserScope(ctx);
      let query = supabase
        .from("housekeeping_tasks")
        .select(
          "id, title, task_type, status, priority, qc_status, qc_required, room_id, hotel_id, assigned_to, due_at, created_at, completed_at",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit ?? 50);
      if (hotel_id) query = query.eq("hotel_id", hotel_id);
      if (status) query = query.eq("status", status);
      if (only_mine) query = query.eq("assigned_to", ctx.getUserId()!);
      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return jsonResult(data ?? []);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : "Lỗi không xác định");
    }
  },
});
