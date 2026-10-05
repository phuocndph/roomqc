import { defineTool } from "@lovable.dev/mcp-js";
import { errorResult, getUserScope, jsonResult, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_hotels",
  title: "Danh sách khách sạn",
  description: "Liệt kê các khách sạn thuộc đơn vị của người dùng đang đăng nhập.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    try {
      const { supabase, tenantId } = await getUserScope(ctx);
      const { data, error } = await supabase
        .from("hotels")
        .select("id, code, name, city, status, total_rooms, total_floors")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) return errorResult(error.message);
      return jsonResult(data ?? []);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : "Lỗi không xác định");
    }
  },
});
