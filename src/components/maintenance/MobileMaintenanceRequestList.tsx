import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { MobileDetailHeader } from "@/components/layout/MobileDetailHeader";
import { PullToRefresh } from "@/components/mobile/TouchOptimized";
import { useMaintenanceRequests } from "@/hooks/useMaintenanceRequests";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Search, Plus } from "lucide-react";
import { PriorityBadge } from "./PriorityBadge";
import { StatusBadge } from "./StatusBadge";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "Tất cả" },
  { value: "waiting", label: "Đang chờ" },
  { value: "pending", label: "Tiếp nhận" },
  { value: "in_progress", label: "Đang xử lý" },
  { value: "completed", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã hủy" },
];

export const MobileMaintenanceRequestList = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view");
  const viewLabel =
    view === "urgent"
      ? "Khẩn cấp chưa hoàn thành"
      : view === "active"
        ? "Yêu cầu cần xử lý"
        : view === "completed"
          ? "Yêu cầu đã hoàn thành"
          : null;
  const priorityFilter =
    view === "urgent" ? "urgent" : searchParams.get("priority") || undefined;
  const requestedStatus =
    view === "completed" ? "completed" : searchParams.get("status");
  const statusFilter =
    requestedStatus &&
    STATUS_FILTERS.some((filter) => filter.value === requestedStatus)
      ? requestedStatus
      : "all";
  const setStatusFilter = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    if (value === "all") next.delete("status");
    else next.set("status", value);
    setSearchParams(next);
  };
  const [search, setSearch] = useState("");

  const filters = {
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(search && { search }),
    ...(priorityFilter && { priority: priorityFilter }),
  };

  const {
    data: loadedRequests = [],
    isLoading,
    isError,
    refetch,
  } = useMaintenanceRequests(filters);
  const requests =
    view === "active" || view === "urgent"
      ? loadedRequests.filter(
          (request) => !["completed", "cancelled"].includes(request.status),
        )
      : loadedRequests;

  const handleRefresh = async () => {
    await refetch();
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title="Yêu cầu bảo trì"
        showBack
        rightContent={
          <PermissionGate module="maintenance" action="create">
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Tạo yêu cầu bảo trì"
            >
              <Link to="/maintenance/requests/new">
                <Plus className="h-5 w-5" />
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      <div className="p-4 space-y-4">
        {viewLabel && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <p role="status" className="text-sm font-medium">
              Đang xem: {viewLabel}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("view");
                next.delete("status");
                next.delete("priority");
                setSearchParams(next);
              }}
            >
              Xem tất cả
            </Button>
          </div>
        )}
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm yêu cầu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Status Filter Chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              aria-pressed={
                (!view || view === "completed") && statusFilter === filter.value
              }
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                (!view || view === "completed") && statusFilter === filter.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Requests List */}
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="space-y-3">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-20 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))
            ) : isError ? (
              <div
                role="alert"
                className="space-y-3 rounded-lg border p-6 text-center"
              >
                <p>Không thể tải yêu cầu bảo trì.</p>
                <button
                  type="button"
                  className="underline"
                  onClick={() => refetch()}
                >
                  Thử lại
                </button>
              </div>
            ) : requests.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Không tìm thấy yêu cầu bảo trì
                  </p>
                </CardContent>
              </Card>
            ) : (
              requests.map((request: any) => (
                <Card
                  key={request.id}
                  className="cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() =>
                    navigate(`/maintenance/requests/${request.id}`)
                  }
                >
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <PriorityBadge priority={request.priority} />
                          <StatusBadge status={request.status} />
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {request.request_code}
                        </span>
                      </div>

                      <div>
                        <p className="font-medium mb-1 line-clamp-1">
                          {request.title}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {request.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{request.location}</span>
                        <span>•</span>
                        <span>
                          {formatDistanceToNow(new Date(request.reported_at), {
                            addSuffix: true,
                            locale: vi,
                          })}
                        </span>
                        {request.reporter && (
                          <>
                            <span>•</span>
                            <span>{request.reporter.full_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </PullToRefresh>
      </div>
    </div>
  );
};
