import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "./useUser";
import { useHotelContext } from "@/contexts/HotelContext";
import {
  buildRecurringIssues,
  recurringPeriods,
  type RecurringRequest,
} from "@/lib/maintenanceRecurring";

export function useRecurringIssues(days = 90) {
  const { tenantId } = useUser();
  const { selectedHotel, isAllHotelsMode } = useHotelContext();
  const period = recurringPeriods.includes(
    days as (typeof recurringPeriods)[number],
  )
    ? days
    : 90;

  return useQuery({
    queryKey: [
      "recurring-issues",
      tenantId,
      isAllHotelsMode ? "all" : selectedHotel?.id,
      period,
    ],
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      if (!tenantId || (!isAllHotelsMode && !selectedHotel?.id)) return [];
      const now = Date.now();
      const rows: RecurringRequest[] = [];
      const pageSize = 500;
      // Read every page: a fixed row limit silently understates repeated incidents.
      for (let offset = 0; ; offset += pageSize) {
        let query = supabase
          .from("maintenance_requests")
          .select(
            "id, hotel_id, item_id, room_id, location, reported_at, actual_cost, estimated_cost, issue_type, status, title, request_code, room:rooms(id, room_number), item:items(id, code, name, unit_price)",
          )
          .eq("tenant_id", tenantId)
          .gte("reported_at", new Date(now - period * 86_400_000).toISOString())
          .lte("reported_at", new Date(now).toISOString())
          .order("reported_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (!isAllHotelsMode && selectedHotel?.id)
          query = query.eq("hotel_id", selectedHotel.id);
        const { data, error } = await query.abortSignal(signal);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      return buildRecurringIssues(rows, period, now);
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
  });
}
