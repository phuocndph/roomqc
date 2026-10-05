import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { MobileStatCard } from '@/components/mobile/MobileDashboardStats'
import { PullToRefresh } from '@/components/mobile/TouchOptimized'
import { useRecurringIssues } from '@/hooks/useRecurringIssues'
import { AlertTriangle, TrendingUp, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

const PERIOD_OPTIONS = [
  { value: 30, label: '30 ngày' },
  { value: 90, label: '90 ngày' },
  { value: 180, label: '6 tháng' },
  { value: 365, label: '1 năm' },
]

const ISSUE_TYPE_LABELS: Record<string, string> = {
  repair: 'Sửa chữa',
  replace: 'Thay thế',
  inspection: 'Kiểm tra',
  cleaning: 'Vệ sinh',
  other: 'Khác',
}

export const MobileRecurringIssuesPage = () => {
  const [period, setPeriod] = useState(90)
  const { data: issues = [], isLoading, refetch } = useRecurringIssues(period)

  const handleRefresh = async () => {
    await refetch()
  }

  const totalIssues = issues.length
  const totalCost = issues.reduce((sum, issue) => sum + issue.totalCost, 0)
  const total30d = issues.reduce((sum, issue) => sum + issue.count30d, 0)

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader title="Vấn đề lặp lại" showBack />

      <div className="p-4 space-y-4">
        {/* Period Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setPeriod(option.value)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                period === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        {issues.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <MobileStatCard
              title="Vấn đề"
              value={totalIssues.toString()}
              icon={AlertTriangle}
              variant="warning"
            />
            <MobileStatCard
              title="Sự cố (30d)"
              value={total30d.toString()}
              icon={TrendingUp}
              variant="default"
            />
            <MobileStatCard
              title="Tổng chi phí"
              value={new Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
                notation: 'compact',
              }).format(totalCost)}
              icon={DollarSign}
              variant="default"
            />
          </div>
        )}

        {/* Issues List */}
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="space-y-3">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-24 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))
            ) : issues.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
                    <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                      <span className="text-3xl">✓</span>
                    </div>
                    <div>
                      <p className="font-medium text-lg mb-2">
                        Tuyệt vời! Không có vấn đề lặp lại
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Trong {period} ngày qua, không có thiết bị hoặc phòng nào gặp
                        sự cố lặp lại (≥2 lần)
                      </p>
                    </div>
                    <div className="text-left w-full mt-4 p-4 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-2">💡 Mẹo phân tích:</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Thử tăng khoảng thời gian để xem xu hướng dài hạn</li>
                        <li>• Vấn đề lặp lại giúp xác định thiết bị cần thay thế</li>
                        <li>• Theo dõi chi phí bảo trì để tối ưu ngân sách</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              issues.map((issue) => (
                <Card key={issue.id}>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium line-clamp-1">
                            {issue.type === 'item'
                              ? issue.item?.name
                              : `Phòng ${issue.room?.room_number}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {issue.location}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/20 rounded-full">
                          <AlertTriangle className="h-3 w-3 text-red-600 dark:text-red-400" />
                          <span className="text-xs font-medium text-red-600 dark:text-red-400">
                            {issue.count30d}
                          </span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-muted rounded-lg">
                          <p className="text-xs text-muted-foreground">30 ngày</p>
                          <p className="text-sm font-bold">{issue.count30d}</p>
                        </div>
                        <div className="p-2 bg-muted rounded-lg">
                          <p className="text-xs text-muted-foreground">
                            {period} ngày
                          </p>
                          <p className="text-sm font-bold">{issue.count90d}</p>
                        </div>
                        <div className="p-2 bg-muted rounded-lg">
                          <p className="text-xs text-muted-foreground">Tần suất</p>
                          <p className="text-sm font-bold">{issue.frequency}/tháng</p>
                        </div>
                      </div>

                      {/* Cost & Primary Issue */}
                      <div className="flex items-center justify-between text-sm pt-2 border-t">
                        <div>
                          <p className="text-muted-foreground">Loại sự cố chính</p>
                          <p className="font-medium">
                            {ISSUE_TYPE_LABELS[issue.primaryIssue]} ({issue.issueCount}
                            )
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground">Tổng chi phí</p>
                          <p className="font-bold">
                            {new Intl.NumberFormat('vi-VN', {
                              style: 'currency',
                              currency: 'VND',
                              notation: 'compact',
                            }).format(issue.totalCost)}
                          </p>
                        </div>
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
  )
}
