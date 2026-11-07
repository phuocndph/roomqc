import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { RecurringSeverity } from "./RecurringIssuesTable";
import {
  recurringIssueName,
  maintenanceRequestCost,
  issueTypeLabels,
  type RecurringIssue,
} from "@/lib/maintenanceRecurring";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";

export function RecurringIssueAnalysisDialog({
  issue,
  period,
  open,
  onOpenChange,
}: {
  issue: RecurringIssue | null;
  period: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(10);
  if (!issue) return null;
  const requests = issue.requests.slice(0, visibleCount);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-7">
            {recurringIssueName(issue)}
          </DialogTitle>
          <DialogDescription>
            {issue.location} · Lịch sử trong {period} ngày
          </DialogDescription>
        </DialogHeader>
        <RecurringSeverity critical={issue.count30d >= 3} />
        {issue.count30d >= 3 && (
          <p className="text-sm">
            Có {issue.count30d} sự cố trong 30 ngày. Nên kiểm tra nguyên nhân
            lặp lại trước khi tiếp tục sửa chữa.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Số sự cố trong kỳ</dt>
            <dd className="mt-1 text-xl font-semibold">
              {issue.countInPeriod} lần
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Chi phí ghi nhận</dt>
            <dd className="mt-1 text-xl font-semibold">
              {formatCurrency(issue.totalCost)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Trung bình mỗi sự cố</dt>
            <dd className="mt-1 font-medium">
              {formatCurrency(issue.avgCost)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              Khoảng cách giữa các lần báo
            </dt>
            <dd className="mt-1 font-medium">
              {issue.averageIntervalDays == null
                ? "Chưa đủ dữ liệu"
                : issue.averageIntervalDays + " ngày"}
            </dd>
          </div>
        </dl>
        <p className="text-xs leading-5 text-muted-foreground">
          Chi phí dùng số thực tế; nếu chưa có thì dùng dự kiến. Yêu cầu đã hủy
          không tính vào phân tích.
        </p>
        <section aria-label="Lịch sử sự cố">
          <h2 className="mb-3 font-semibold">
            Lịch sử sự cố ({issue.countInPeriod})
          </h2>
          <div className="divide-y rounded-lg border">
            {requests.map((request) => (
              <article key={request.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {request.request_code} ·{" "}
                    {request.reported_at
                      ? format(new Date(request.reported_at), "dd/MM/yyyy")
                      : "Chưa có ngày"}
                  </span>
                  <StatusBadge
                    status={
                      request.status as
                        | "waiting"
                        | "pending"
                        | "in_progress"
                        | "completed"
                        | "cancelled"
                    }
                  />
                </div>
                <Link
                  to={"/maintenance/requests/" + request.id}
                  onClick={() => onOpenChange(false)}
                  className="block break-words font-medium text-blue-700 underline-offset-4 hover:underline dark:text-blue-400"
                >
                  {request.title}
                </Link>
                <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    {issueTypeLabels[request.issue_type] || request.issue_type}
                  </span>
                  <span>
                    {request.actual_cost == null &&
                    request.estimated_cost == null
                      ? "Chưa ghi nhận chi phí"
                      : formatCurrency(maintenanceRequestCost(request)) +
                        (request.actual_cost == null
                          ? " (dự kiến)"
                          : " (thực tế)")}
                  </span>
                </div>
              </article>
            ))}
          </div>
          {visibleCount < issue.requests.length && (
            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={() => setVisibleCount((count) => count + 10)}
            >
              Xem thêm lịch sử ({issue.requests.length - visibleCount})
            </Button>
          )}
        </section>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Đóng
        </Button>
      </DialogContent>
    </Dialog>
  );
}
