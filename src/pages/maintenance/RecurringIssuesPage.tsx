import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, Search, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MobileDetailHeader } from "@/components/layout/MobileDetailHeader";
import { RecurringIssuesTable } from "@/components/maintenance/RecurringIssuesTable";
import { MobileRecurringIssuesPage } from "@/components/maintenance/MobileRecurringIssuesPage";
import { RecurringIssueAnalysisDialog } from "@/components/maintenance/RecurringIssueAnalysisDialog";
import { useRecurringIssues } from "@/hooks/useRecurringIssues";
import {
  recurringPeriods,
  filterRecurringIssues,
} from "@/lib/maintenanceRecurring";
import { useBreakpoint } from "@/lib/breakpoints";
import { navigateBack } from "@/lib/navigation";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function RecurringIssuesPage() {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const [params, setParams] = useSearchParams();
  const requestedPeriod = Number(params.get("period") || 90);
  const period = recurringPeriods.includes(
    requestedPeriod as (typeof recurringPeriods)[number],
  )
    ? requestedPeriod
    : 90;
  const search = params.get("q") || "";
  const criticalOnly = params.get("level") === "critical";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    data: issues = [],
    isLoading,
    isPending,
    isError,
    refetch,
  } = useRecurringIssues(period);
  const filtered = filterRecurringIssues(issues, search, criticalOnly);
  const selectedIssue = issues.find((issue) => issue.id === selectedId) || null;
  const criticalCount = issues.filter((issue) => issue.count30d >= 3).length;

  const updateFilter = (name: string, value: string, replace = false) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setSelectedId(null);
    setParams(next, { replace });
  };
  const resetFilters = () => {
    const next = new URLSearchParams(params);
    next.delete("q");
    next.delete("level");
    setParams(next, { replace: true });
  };

  return (
    <div className={isMobile ? "pb-20" : "space-y-5"}>
      {isMobile ? (
        <MobileDetailHeader title="Vấn đề lặp lại" showBack />
      ) : (
        <PageHeader
          title="Vấn đề lặp lại"
          description="Tìm thiết bị, phòng hoặc khu vực cần kiểm tra nguyên nhân."
        >
          <Button
            variant="outline"
            onClick={() => navigateBack(navigate, "/maintenance")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại
          </Button>
        </PageHeader>
      )}
      <div className={isMobile ? "space-y-4 p-4" : "space-y-5"}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_200px_200px]">
          <div className="col-span-2 lg:col-span-1">
            <label
              htmlFor="recurring-search"
              className="mb-2 block text-sm font-medium"
            >
              Tìm thiết bị / khu vực
            </label>
            <div className="relative">
              <Search
                aria-hidden
                className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
              />
              <Input
                id="recurring-search"
                value={search}
                onChange={(event) =>
                  updateFilter("q", event.target.value, true)
                }
                placeholder="Tên, mã thiết bị hoặc vị trí..."
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <label
              id="recurring-period-label"
              className="mb-2 block text-sm font-medium"
            >
              Khoảng thời gian
            </label>
            <Select
              value={String(period)}
              onValueChange={(value) => updateFilter("period", value)}
            >
              <SelectTrigger aria-labelledby="recurring-period-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {recurringPeriods.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {days === 180
                      ? "6 tháng (180 ngày)"
                      : days === 365
                        ? "1 năm (365 ngày)"
                        : days + " ngày"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label
              id="recurring-level-label"
              className="mb-2 block text-sm font-medium"
            >
              Mức theo dõi
            </label>
            <Select
              value={criticalOnly ? "critical" : "all"}
              onValueChange={(value) =>
                updateFilter("level", value === "all" ? "" : value)
              }
            >
              <SelectTrigger aria-labelledby="recurring-level-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="critical">Ưu tiên kiểm tra</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Lặp lại: từ 2 sự cố trong {period} ngày. Ưu tiên kiểm tra: từ 3 sự cố
          trong 30 ngày.
        </p>
        {isError ? (
          <div
            role="alert"
            className="rounded-lg border bg-card p-8 text-center"
          >
            <p className="font-medium">Không thể tải lịch sử sự cố.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Chưa có dữ liệu để kết luận có vấn đề lặp lại hay không.
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Thử lại
            </Button>
          </div>
        ) : isLoading || isPending ? (
          <div
            role="status"
            aria-label="Đang tải lịch sử sự cố"
            className="space-y-3"
          >
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <details
              open={isMobile ? undefined : true}
              className={isMobile ? "rounded-lg border bg-card p-4" : ""}
            >
              <summary
                className={
                  isMobile ? "cursor-pointer text-sm font-medium" : "hidden"
                }
              >
                Tổng quan kỳ này · {issues.length} nơi · {criticalCount} ưu tiên
              </summary>
              <div
                className={
                  isMobile
                    ? "mt-4 grid grid-cols-2 gap-3"
                    : "grid grid-cols-2 gap-3 lg:grid-cols-3"
                }
              >
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-sm text-muted-foreground">
                    Nơi có sự cố lặp lại
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {issues.length}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-sm text-muted-foreground">
                    Ưu tiên kiểm tra
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-red-700 dark:text-red-400">
                    {criticalCount}
                  </p>
                </div>
                <div className="col-span-2 rounded-lg border bg-card p-4 lg:col-span-1">
                  <p className="text-sm text-muted-foreground">
                    Chi phí tại các nơi này · {period} ngày
                  </p>
                  <p className="mt-2 break-words text-2xl font-semibold tabular-nums">
                    {formatCurrency(
                      issues.reduce((sum, issue) => sum + issue.totalCost, 0),
                    )}
                  </p>
                </div>
              </div>
            </details>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Hiển thị {filtered.length} / {issues.length} nơi có sự cố lặp
                lại
              </p>
              {(search || criticalOnly) && (
                <Button size="sm" variant="outline" onClick={resetFilters}>
                  Xóa bộ lọc
                </Button>
              )}
            </div>
            {filtered.length ? (
              isMobile ? (
                <MobileRecurringIssuesPage
                  issues={filtered}
                  period={period}
                  onSelect={(issue) => setSelectedId(issue.id)}
                />
              ) : (
                <RecurringIssuesTable
                  issues={filtered}
                  period={period}
                  onSelect={(issue) => setSelectedId(issue.id)}
                />
              )
            ) : (
              <div className="rounded-lg border bg-card px-4 py-10 text-center">
                <Wrench className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <h2 className="font-semibold">
                  {issues.length
                    ? "Không tìm thấy kết quả phù hợp"
                    : "Chưa ghi nhận sự cố lặp lại"}
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  {issues.length
                    ? "Thử từ khóa khác hoặc xóa bộ lọc."
                    : "Chưa có nơi nào được báo sự cố từ 2 lần trong kỳ này. Có thể chọn khoảng thời gian dài hơn để kiểm tra."}
                </p>
              </div>
            )}
            <p className="text-xs leading-5 text-muted-foreground">
              Không tính yêu cầu đã hủy. Chi phí dùng số thực tế; nếu chưa có
              thì dùng dự kiến. Số liệu tổng quan không thay đổi theo bộ lọc tìm
              kiếm.
            </p>
          </>
        )}
      </div>
      <RecurringIssueAnalysisDialog
        key={selectedId + ":" + period}
        issue={selectedIssue}
        period={period}
        open={!!selectedIssue && !isError}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </div>
  );
}
