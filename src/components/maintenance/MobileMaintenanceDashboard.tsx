import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Wrench,
  CheckCircle,
  Plus,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useMaintenanceDashboard } from "@/hooks/useMaintenanceDashboard";
import { PriorityBadge } from "./PriorityBadge";
import { StatusBadge } from "./StatusBadge";
import { formatCurrency } from "@/lib/utils";

export function MobileMaintenanceDashboard() {
  const { data, isLoading, isPending, isError, refetch } =
    useMaintenanceDashboard();
  const active = data
    ? [
        ...data.activeRequests.urgent,
        ...data.activeRequests.high,
        ...data.activeRequests.medium,
        ...data.activeRequests.low,
      ]
    : [];

  return (
    <div className="space-y-4 px-4 pb-24">
      <div>
        <h1 className="text-xl font-bold">Bảo trì</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ưu tiên sự cố cần xử lý, theo dõi tiến độ sửa chữa.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link to="/maintenance/requests">Tất cả yêu cầu</Link>
        </Button>
        <PermissionGate module="maintenance" action="create">
          <Button asChild>
            <Link to="/maintenance/requests/new">
              <Plus className="mr-2 h-4 w-4" />
              Tạo yêu cầu
            </Link>
          </Button>
        </PermissionGate>
      </div>
      {isError ? (
        <div role="alert" className="rounded-lg border p-6 text-center">
          <p>Không thể tải tổng quan bảo trì.</p>
          <Button variant="outline" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Thử lại
          </Button>
        </div>
      ) : isLoading || isPending ? (
        <div
          role="status"
          aria-label="Đang tải tổng quan bảo trì"
          className="space-y-3"
        >
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                label: "Khẩn cấp",
                count: data?.activeRequests.urgent.length || 0,
                icon: AlertTriangle,
                color: "text-red-700 dark:text-red-400",
                to: "/maintenance/requests?view=urgent",
              },
              {
                label: "Cần xử lý",
                count: data?.stats.inProgress || 0,
                icon: Wrench,
                color: "text-amber-700 dark:text-amber-400",
                to: "/maintenance/requests?view=active",
              },
              {
                label: "Hoàn thành",
                count: data?.stats.completed || 0,
                icon: CheckCircle,
                color: "text-green-700 dark:text-green-400",
                to: "/maintenance/requests?view=completed",
              },
            ].map((card) => (
              <Link
                key={card.label}
                to={card.to}
                className="rounded-lg border bg-card p-3 focus-visible:outline focus-visible:outline-2"
              >
                <card.icon className={"mb-2 h-5 w-5 " + card.color} />
                <p className="text-xs font-medium">{card.label}</p>
                <p
                  className={
                    "mt-1 text-2xl font-bold tabular-nums " + card.color
                  }
                >
                  {card.count}
                </p>
              </Link>
            ))}
          </div>
          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-2 border-b p-4">
              <h2 className="font-semibold">Cần xử lý</h2>
              <Link
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 dark:text-blue-400"
                to="/maintenance/requests?view=active"
              >
                Tất cả
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {active.length ? (
              <div className="divide-y">
                {active.slice(0, 5).map((request) => (
                  <Link
                    key={request.id}
                    to={"/maintenance/requests/" + request.id}
                    className="block space-y-2 p-4 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <div className="flex flex-wrap gap-2">
                      <PriorityBadge priority={request.priority} />
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="break-words font-medium">{request.title}</p>
                    <p className="break-words text-xs text-muted-foreground">
                      {request.request_code} ·{" "}
                      {request.room?.room_number
                        ? "Phòng " + request.room.room_number
                        : request.location}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <CheckCircle className="mx-auto mb-3 h-8 w-8 text-green-700 dark:text-green-400" />
                <p className="text-sm text-muted-foreground">
                  Không có yêu cầu cần xử lý.
                </p>
              </div>
            )}
          </section>
          {data && (
            <details className="rounded-lg border bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Chi phí & hiệu suất bảo trì
              </summary>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Chi phí 30 ngày</dt>
                  <dd className="mt-1 font-semibold">
                    {formatCurrency(data.stats.costLast30Days)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Thời gian xử lý trung bình
                  </dt>
                  <dd className="mt-1 font-semibold">
                    {data.stats.avgTime} giờ
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tỷ lệ hoàn thành</dt>
                  <dd className="mt-1 font-semibold">
                    {data.stats.completionRate}%
                  </dd>
                </div>
              </dl>
            </details>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/maintenance/recurring-issues">Vấn đề lặp lại</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/reports/maintenance">Báo cáo bảo trì</Link>
        </Button>
        <PermissionGate module="users" action="view">
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/users">Nhân viên kỹ thuật</Link>
          </Button>
        </PermissionGate>
      </div>
    </div>
  );
}
