import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listHotels from "./tools/list-hotels";
import listRooms from "./tools/list-rooms";
import listBookings from "./tools/list-bookings";
import listHousekeepingTasks from "./tools/list-housekeeping-tasks";
import createMaintenanceRequest from "./tools/create-maintenance-request";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "hotel-inventory-hub",
  title: "Hotel Inventory Hub",
  version: "0.1.0",
  instructions:
    "Công cụ vận hành khách sạn RoomQc. Dùng list_hotels/list_rooms để xem tình trạng phòng, list_bookings để xem đặt phòng, list_housekeeping_tasks để xem công việc buồng phòng, create_maintenance_request để tạo yêu cầu bảo trì. Mọi dữ liệu đều giới hạn theo tài khoản đã đăng nhập.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listHotels, listRooms, listBookings, listHousekeepingTasks, createMaintenanceRequest],
});
