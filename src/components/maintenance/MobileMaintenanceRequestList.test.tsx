import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileMaintenanceRequestList } from "./MobileMaintenanceRequestList";

const state = vi.hoisted(() => ({ canCreate: true, filters: vi.fn() }));
vi.mock("@/hooks/useMaintenanceRequests", () => ({
  useMaintenanceRequests: (filters: unknown) => {
    state.filters(filters);
    return {
      data: [
        {
          id: "waiting",
          title: "Sự cố đang chờ",
          status: "waiting",
          priority: "urgent",
          request_code: "BT01",
          location: "101",
          reported_at: "2026-10-16T00:00:00Z",
        },
        {
          id: "completed",
          title: "Sự cố đã hoàn thành",
          status: "completed",
          priority: "urgent",
          request_code: "BT02",
          location: "102",
          reported_at: "2026-10-16T00:00:00Z",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
}));
vi.mock("@/components/auth/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: ReactNode }) =>
    state.canCreate ? <>{children}</> : null,
}));
vi.mock("@/components/layout/MobileDetailHeader", () => ({
  MobileDetailHeader: ({
    title,
    rightContent,
  }: {
    title: string;
    rightContent: ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {rightContent}
    </header>
  ),
}));
vi.mock("@/components/mobile/TouchOptimized", () => ({
  PullToRefresh: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}
const app = (url = "/maintenance/requests?view=urgent") => (
  <MemoryRouter initialEntries={[url]}>
    <MobileMaintenanceRequestList />
    <Location />
  </MemoryRouter>
);

describe("mobile maintenance work queue context", () => {
  beforeEach(() => {
    state.canCreate = true;
    state.filters.mockReset();
  });
  it("explains urgent filtering and does not mark all statuses as selected", () => {
    render(app());
    expect(screen.getByText("Đang xem: Khẩn cấp chưa hoàn thành")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tất cả" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(state.filters).toHaveBeenCalledWith({ priority: "urgent" });
    expect(screen.queryByText("Sự cố đã hoàn thành")).not.toBeInTheDocument();
    expect(screen.getByText("Sự cố đang chờ")).toBeInTheDocument();
  });
  it("clears all hidden work queue filters with one visible action", () => {
    render(
      app("/maintenance/requests?view=urgent&priority=urgent&status=waiting"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Xem tất cả" }),
    );
    expect(screen.queryByText(/^Đang xem:/)).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toBeEmptyDOMElement();
    expect(
      screen.getByRole("button", { name: "Tất cả" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(state.filters).toHaveBeenLastCalledWith({});
  });
  it("keeps completed work visibly selected", () => {
    render(app("/maintenance/requests?view=completed"));
    expect(screen.getByText("Đang xem: Yêu cầu đã hoàn thành")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hoàn thành" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  it("does not offer the create shortcut without permission", () => {
    state.canCreate = false;
    render(app());
    expect(
      screen.queryByRole("link", { name: "Tạo yêu cầu bảo trì" }),
    ).not.toBeInTheDocument();
  });
});
