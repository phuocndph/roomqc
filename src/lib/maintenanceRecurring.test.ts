import { describe, expect, it } from "vitest";
import {
  buildRecurringIssues,
  filterRecurringIssues,
  maintenanceRequestCost,
  recurringIssueName,
  type RecurringRequest,
} from "./maintenanceRecurring";

const now = Date.parse("2026-10-16T12:00:00Z");
const row = (
  id: string,
  daysAgo: number,
  extra: Partial<RecurringRequest> = {},
): RecurringRequest => ({
  id,
  hotel_id: "hotel",
  item_id: null,
  room_id: "room",
  location: "Tầng 1",
  reported_at: new Date(now - daysAgo * 86_400_000).toISOString(),
  actual_cost: null,
  estimated_cost: 100,
  issue_type: "repair",
  status: "completed",
  title: "Sửa điều hòa",
  request_code: id,
  room: { id: "room", room_number: "101" },
  item: null,
  ...extra,
});

describe("recurring maintenance analysis", () => {
  it("uses the selected period and a real 30-day count", () => {
    const rows = [row("a", 2), row("b", 20), row("c", 120)];
    expect(buildRecurringIssues(rows, 90, now)[0].countInPeriod).toBe(2);
    const issue = buildRecurringIssues(rows, 180, now)[0];
    expect(issue.countInPeriod).toBe(3);
    expect(issue.count30d).toBe(2);
    expect(issue.frequency).toBe(0.5);
  });
  it("excludes cancellations, invalid dates, future records and out-of-period records", () => {
    expect(
      buildRecurringIssues(
        [
          row("a", 2),
          row("b", 3, { status: "cancelled" }),
          row("c", 100),
          row("d", -1),
          row("e", 1, { reported_at: null }),
        ],
        90,
        now,
      ),
    ).toEqual([]);
  });
  it("preserves zero actual cost instead of substituting estimates", () => {
    expect(
      maintenanceRequestCost({ actual_cost: 0, estimated_cost: 500 }),
    ).toBe(0);
    expect(
      maintenanceRequestCost({ actual_cost: null, estimated_cost: 500 }),
    ).toBe(500);
    const issue = buildRecurringIssues(
      [
        row("a", 1, { actual_cost: 0, estimated_cost: 500 }),
        row("b", 3, { actual_cost: 100 }),
      ],
      90,
      now,
    )[0];
    expect(issue.totalCost).toBe(100);
    expect(issue.avgCost).toBe(50);
  });
  it("does not merge unrelated locations or hotels", () => {
    const rows = [
      row("a", 2, { room_id: null, room: null, location: "Sảnh" }),
      row("b", 4, { room_id: null, room: null, location: "Nhà bếp" }),
      row("c", 2, { hotel_id: "other" }),
      row("d", 1),
    ];
    expect(buildRecurringIssues(rows, 90, now)).toEqual([]);
  });
  it("groups matching locations without requiring a room or asset", () => {
    const issue = buildRecurringIssues(
      [
        row("a", 1, { room_id: null, room: null, location: "Sảnh chính" }),
        row("b", 5, { room_id: null, room: null, location: "  SẢNH CHÍNH  " }),
      ],
      90,
      now,
    )[0];
    expect(issue.type).toBe("location");
    expect(recurringIssueName(issue)).toBe("Sảnh chính");
  });
  it("calculates intervals from actual report dates, not 90 divided by count", () => {
    const issue = buildRecurringIssues(
      [row("a", 1), row("b", 3), row("c", 9)],
      180,
      now,
    )[0];
    expect(issue.averageIntervalDays).toBe(4);
    expect(issue.requests.map((request) => request.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("keeps assets separate from room-wide incidents and prioritizes repeated recent incidents", () => {
    const item = {
      id: "item",
      code: "DH01",
      name: "Điều hòa",
      unit_price: 1000,
    };
    const issues = buildRecurringIssues(
      [
        row("r1", 1),
        row("r2", 2),
        row("i1", 1, { item_id: "item", item }),
        row("i2", 2, { item_id: "item", item }),
        row("i3", 3, { item_id: "item", item }),
      ],
      90,
      now,
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].type).toBe("item");
    expect(filterRecurringIssues(issues, "dieu hoa", false)).toHaveLength(1);
    expect(filterRecurringIssues(issues, "dh01", true)).toHaveLength(1);
    expect(filterRecurringIssues(issues, "", true)).toHaveLength(1);
  });
});
