import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useRecurringIssues } from "./useRecurringIssues";

const state = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  range: vi.fn(),
  order: vi.fn(),
  abortSignal: vi.fn(),
  context: {
    selectedHotel: { id: "hotel" } as { id: string } | null,
    isAllHotelsMode: false,
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: state.from },
}));
vi.mock("./useUser", () => ({ useUser: () => ({ tenantId: "tenant" }) }));
vi.mock("@/contexts/HotelContext", () => ({
  useHotelContext: () => state.context,
}));
const wrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

describe("recurring issue queries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.context.selectedHotel = { id: "hotel" };
    state.context.isAllHotelsMode = false;
    const chain = {
      select: vi.fn(),
      eq: state.eq,
      gte: vi.fn(),
      lte: vi.fn(),
      order: state.order,
      range: state.range,
      abortSignal: state.abortSignal,
    };
    Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
    state.from.mockReturnValue(chain);
    state.abortSignal.mockResolvedValue({ data: [], error: null });
  });
  it("keeps tenant and hotel scopes and orders pagination deterministically", async () => {
    const { result } = renderHook(() => useRecurringIssues(180), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.eq).toHaveBeenCalledWith("tenant_id", "tenant");
    expect(state.eq).toHaveBeenCalledWith("hotel_id", "hotel");
    expect(state.order).toHaveBeenCalledWith("id", { ascending: false });
    expect(state.range).toHaveBeenCalledWith(0, 499);
    expect(state.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("loads more than 200 rows and does not silently truncate the analysis", async () => {
    const row = {
      hotel_id: "hotel",
      item_id: null,
      room_id: "room",
      location: "101",
      reported_at: new Date().toISOString(),
      actual_cost: 0,
      estimated_cost: 100,
      issue_type: "repair",
      status: "completed",
      title: "Sửa chữa",
      request_code: "BT",
      room: { id: "room", room_number: "101" },
      item: null,
    };
    state.abortSignal
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, index) => ({
          ...row,
          id: String(index),
        })),
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ ...row, id: "last" }], error: null });
    const { result } = renderHook(() => useRecurringIssues(), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.range).toHaveBeenNthCalledWith(2, 500, 999);
    expect(result.current.data?.[0].countInPeriod).toBe(501);
    expect(result.current.data?.[0].totalCost).toBe(0);
  });
  it("does not present a failed later page as a complete result", async () => {
    state.abortSignal
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, () => ({})),
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    const { result } = renderHook(() => useRecurringIssues(), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
  it("does not query without a selected hotel outside all-hotels mode", () => {
    state.context.selectedHotel = null;
    const { result } = renderHook(() => useRecurringIssues(), {
      wrapper: wrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(state.from).not.toHaveBeenCalled();
  });
  it("keeps the tenant filter in all-hotels mode", async () => {
    state.context.selectedHotel = null;
    state.context.isAllHotelsMode = true;
    const { result } = renderHook(() => useRecurringIssues(), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.eq).toHaveBeenCalledWith("tenant_id", "tenant");
    expect(state.eq).not.toHaveBeenCalledWith("hotel_id", expect.anything());
  });
});
