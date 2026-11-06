import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileMaintenanceDashboard } from "./MobileMaintenanceDashboard";

const state = vi.hoisted(() => ({
  isError: false,
  isLoading: false,
  canCreate: true,
  refetch: vi.fn(),
}));
vi.mock("@/hooks/useMaintenanceDashboard", () => ({
  useMaintenanceDashboard: () => ({
    ...state,
    data: {
      stats: {
        inProgress: 3,
        completed: 2,
        costLast30Days: 0,
        avgTime: 1,
        completionRate: 40,
      },
      activeRequests: {
        urgent: [
          {
            id: "urgent",
            title: "Mất điện phòng 101",
            status: "waiting",
            priority: "urgent",
            request_code: "BT-01",
            location: "Tầng 1",
          },
        ],
        high: [],
        medium: [],
        low: [],
      },
    },
  }),
}));
vi.mock("@/components/auth/PermissionGate", () => ({
  PermissionGate: ({
    children,
    action,
  }: {
    children: ReactNode;
    action: string;
  }) => (action === "create" && !state.canCreate ? null : <>{children}</>),
}));
const app = () => (
  <MemoryRouter>
    <MobileMaintenanceDashboard />
  </MemoryRouter>
);
describe("mobile maintenance dashboard", () => {
  beforeEach(() => {
    state.isError = false;
    state.isLoading = false;
    state.canCreate = true;
    state.refetch.mockReset();
  });
  it("links operational counts to the correct queues and keeps secondary functions accessible", () => {
    render(app());
    expect(
      screen.getByRole("link", { name: "Khẩn cấp 1" }),
    ).toHaveAttribute("href", "/maintenance/requests?view=urgent");
    expect(screen.getByRole("link", { name: /Cần xử lý 3/ })).toHaveAttribute(
      "href",
      "/maintenance/requests?view=active",
    );
    expect(screen.getByRole("link", { name: /Hoàn thành 2/ })).toHaveAttribute(
      "href",
      "/maintenance/requests?view=completed",
    );
    expect(
      screen.getByRole("link", { name: "Vấn đề lặp lại" }),
    ).toHaveAttribute("href", "/maintenance/recurring-issues");
    expect(
      screen.getByRole("link", { name: "Báo cáo bảo trì" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Mất điện phòng 101/ }),
    ).toHaveAttribute("href", "/maintenance/requests/urgent");
  });
  it("does not offer create without the existing create permission", () => {
    state.canCreate = false;
    render(app());
    expect(
      screen.queryByRole("link", { name: "Tạo yêu cầu" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Tất cả yêu cầu" }),
    ).toBeInTheDocument();
  });
  it("shows retry on failure instead of a healthy empty dashboard", () => {
    state.isError = true;
    render(app());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Không thể tải tổng quan bảo trì",
    );
    expect(
      screen.queryByRole("link", { name: /Khẩn cấp/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
