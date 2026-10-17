import type { Database } from "@/integrations/supabase/types";

type RequestRow = Database["public"]["Tables"]["maintenance_requests"]["Row"];
export type RecurringRequest = Pick<
  RequestRow,
  | "id"
  | "hotel_id"
  | "item_id"
  | "room_id"
  | "location"
  | "reported_at"
  | "actual_cost"
  | "estimated_cost"
  | "issue_type"
  | "status"
  | "title"
  | "request_code"
> & {
  room: { id: string; room_number: string } | null;
  item: {
    id: string;
    name: string;
    code: string;
    unit_price: number | null;
  } | null;
};

export interface RecurringIssue {
  id: string;
  type: "item" | "room" | "location";
  item: RecurringRequest["item"];
  room: RecurringRequest["room"];
  location: string;
  requests: RecurringRequest[];
  count30d: number;
  countInPeriod: number;
  primaryIssue: string;
  issueCount: number;
  totalCost: number;
  avgCost: number;
  frequency: number;
  averageIntervalDays: number | null;
}

export const recurringPeriods = [30, 90, 180, 365] as const;
export const issueTypeLabels: Record<string, string> = {
  repair: "Sửa chữa",
  replace: "Thay thế",
  inspection: "Kiểm tra",
  cleaning: "Vệ sinh",
  other: "Khác",
};

export function recurringIssueName(issue: RecurringIssue) {
  if (issue.type === "item") return issue.item?.name || "Thiết bị đã xóa";
  if (issue.type === "room")
    return issue.room ? `Phòng ${issue.room.room_number}` : "Phòng đã xóa";
  return issue.location;
}

export function maintenanceRequestCost(
  request: Pick<RecurringRequest, "actual_cost" | "estimated_cost">,
) {
  return request.actual_cost ?? request.estimated_cost ?? 0;
}

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .trim();

export function filterRecurringIssues(
  issues: RecurringIssue[],
  search: string,
  criticalOnly: boolean,
) {
  const query = normalize(search);
  return issues.filter(
    (issue) =>
      (!criticalOnly || issue.count30d >= 3) &&
      (!query ||
        normalize(
          `${recurringIssueName(issue)} ${issue.item?.code || ""} ${issue.location}`,
        ).includes(query)),
  );
}

export function buildRecurringIssues(
  rows: RecurringRequest[],
  days: number,
  now = Date.now(),
): RecurringIssue[] {
  const cutoff = now - days * 86_400_000;
  const grouped = new Map<string, RecurringRequest[]>();
  for (const row of rows) {
    const date = row.reported_at ? Date.parse(row.reported_at) : NaN;
    if (
      row.status === "cancelled" ||
      !Number.isFinite(date) ||
      date < cutoff ||
      date > now
    )
      continue;
    const target = row.item_id
      ? `item:${row.item_id}`
      : row.room_id
        ? `room:${row.room_id}`
        : `location:${normalize(row.location)}`;
    if (!row.item_id && !row.room_id && !row.location.trim()) continue;
    const key = `${row.hotel_id}:${target}`;
    const requests = grouped.get(key) || [];
    requests.push(row);
    grouped.set(key, requests);
  }

  return [...grouped.entries()]
    .filter(([, requests]) => requests.length >= 2)
    .map(([id, requests]) => {
      requests.sort(
        (a, b) => Date.parse(b.reported_at!) - Date.parse(a.reported_at!),
      );
      const latest = requests[0];
      const type: RecurringIssue["type"] = latest.item_id
        ? "item"
        : latest.room_id
          ? "room"
          : "location";
      const totalCost = requests.reduce(
        (sum, request) => sum + maintenanceRequestCost(request),
        0,
      );
      const counts = new Map<string, number>();
      requests.forEach((request) =>
        counts.set(
          request.issue_type,
          (counts.get(request.issue_type) || 0) + 1,
        ),
      );
      const [primaryIssue, issueCount] = [...counts].sort(
        (a, b) => b[1] - a[1],
      )[0];
      return {
        id,
        type,
        item: latest.item,
        room: latest.room,
        location: latest.location,
        requests,
        totalCost,
        avgCost: Math.round(totalCost / requests.length),
        count30d: requests.filter(
          (request) =>
            Date.parse(request.reported_at!) >= now - 30 * 86_400_000,
        ).length,
        countInPeriod: requests.length,
        primaryIssue,
        issueCount,
        frequency: Number(((requests.length * 30) / days).toFixed(1)),
        averageIntervalDays:
          Math.round(
            ((Date.parse(latest.reported_at!) -
              Date.parse(requests[requests.length - 1].reported_at!)) /
              86_400_000 /
              (requests.length - 1)) *
              10,
          ) / 10,
      };
    })
    .sort(
      (a, b) =>
        b.count30d - a.count30d ||
        b.countInPeriod - a.countInPeriod ||
        b.totalCost - a.totalCost,
    );
}
