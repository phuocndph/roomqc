import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRecurringIssues,
  type RecurringIssue,
  type RecurringRequest,
} from "@/lib/maintenanceRecurring";
import RecurringIssuesPage from "./RecurringIssuesPage";

const state = vi.hoisted(() => ({
  data: [] as RecurringIssue[],
  isError: false,
  isLoading: false,
  mobile: false,
  refetch: vi.fn(),
  useIssues: vi.fn(),
}));
vi.mock("@/hooks/useRecurringIssues", () => ({
  useRecurringIssues: (period: number) => {
    state.useIssues(period);
    return state;
  },
}));
vi.mock("@/lib/breakpoints", () => ({
  useBreakpoint: () => ({ isMobile: state.mobile }),
}));
vi.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title, children }: { title: string; children: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {children}
    </header>
  ),
}));
vi.mock("@/components/layout/MobileDetailHeader", () => ({
  MobileDetailHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const request = (id: string): RecurringRequest => ({
  id,
  hotel_id: "hotel",
  item_id: null,
  room_id: "room",
  location: "Tầng 1",
  reported_at: new Date(Date.now() - Number(id) * 86_400_000).toISOString(),
  actual_cost: 0,
  estimated_cost: 1000,
  issue_type: "repair",
  status: "completed",
  title: "Sửa điều hòa " + id,
  request_code: "BT-" + id,
  room: { id: "room", room_number: "101" },
  item: null,
});
function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}
const app = (url = "/maintenance/recurring-issues") => (
  <MemoryRouter initialEntries={[url]}>
    <RecurringIssuesPage />
    <Location />
  </MemoryRouter>
);

describe("recurring issue presentation", () => {
  beforeEach(() => {
    state.mobile = false;
    state.isError = false;
    state.isLoading = false;
    state.refetch.mockReset();
    state.useIssues.mockReset();
    state.data = buildRecurringIssues(
      [request("1"), request("2"), request("3")],
      180,
    );
  });
  it("uses the selected period from the URL in data and table labels", () => {
    render(app("/maintenance/recurring-issues?period=180"));
    expect(state.useIssues).toHaveBeenCalledWith(180);
    expect(
      screen.getByRole("columnheader", { name: "Trong 180 ngày" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("90 ngày", { exact: true }),
    ).not.toBeInTheDocument();
  });
  it("shows a retryable error instead of a reassuring empty state or zero statistics", () => {
    state.data = [];
    state.isError = true;
    render(app());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Không thể tải lịch sử sự cố",
    );
    expect(
      screen.queryByText("Chưa ghi nhận sự cố lặp lại"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Nơi có sự cố lặp lại")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("searches and clears filters while preserving the selected period", () => {
    render(app("/maintenance/recurring-issues?period=180"));
    fireEvent.change(screen.getByLabelText("Tìm thiết bị / khu vực"), {
      target: { value: "phong 999" },
    });
    expect(
      screen.getByText("Không tìm thấy kết quả phù hợp"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "period=180&q=phong+999",
    );
    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    expect(
      screen.getByRole("button", { name: "Xem lịch sử Phòng 101" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("period=180");
  });
  it("opens actual history from mobile and offers request links", () => {
    state.mobile = true;
    render(app("/maintenance/recurring-issues?period=180"));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Xem lịch sử Phòng 101" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/Lịch sử trong 180 ngày/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Sửa điều hòa 1" }),
    ).toHaveAttribute("href", "/maintenance/requests/1");
    expect(within(dialog).getAllByText(/\(thực tế\)/)).toHaveLength(3);
    expect(
      within(dialog).queryByText(/giá trị thay thế ước tính/),
    ).not.toBeInTheDocument();
  });
  it("does not permanently hide history after the first ten requests", () => {
    state.data = buildRecurringIssues(
      Array.from({ length: 12 }, (_, index) => request(String(index + 1))),
      180,
    );
    render(app("/maintenance/recurring-issues?period=180"));
    fireEvent.click(
      screen.getByRole("button", { name: "Xem lịch sử Phòng 101" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("link")).toHaveLength(10);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Xem thêm lịch sử (2)" }),
    );
    expect(within(dialog).getAllByRole("link")).toHaveLength(12);
  });
  it("falls back to 90 days for unsupported URL values", () => {
    render(app("/maintenance/recurring-issues?period=-10"));
    expect(state.useIssues).toHaveBeenCalledWith(90);
  });
});
