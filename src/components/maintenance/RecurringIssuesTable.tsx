import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertTriangle, TrendingUp, Wrench, Eye, MoreHorizontal, MapPin } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { RecurringIssueAnalysisDialog } from './RecurringIssueAnalysisDialog'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface RecurringIssue {
  id: string
  type: 'item' | 'room'
  item?: any
  room?: any
  location: string
  count30d: number
  count90d: number
  primaryIssue: string
  issueCount: number
  frequency: number
  avgCost: number
  totalCost: number
}

interface RecurringIssuesTableProps {
  issues: RecurringIssue[]
}

const issueTypeLabels: Record<string, string> = {
  repair: 'Sửa chữa',
  replace: 'Thay thế',
  inspection: 'Kiểm tra',
  cleaning: 'Vệ sinh',
  other: 'Khác',
}

const severityConfig = {
  critical: { color: 'text-red-600', dot: 'bg-red-500', label: 'Nghiêm trọng' },
  warning: { color: 'text-amber-600', dot: 'bg-amber-500', label: 'Cảnh báo' },
}

export const RecurringIssuesTable = ({ issues }: RecurringIssuesTableProps) => {
  const [selectedIssue, setSelectedIssue] = useState<RecurringIssue | null>(null)

  if (!issues || issues.length === 0) {
    return (
      <div className="border rounded-lg">
        <div className="flex flex-col items-center justify-center py-12">
          <Wrench className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Không có vấn đề lặp lại</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="border rounded-lg">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Thiết bị / Phòng</TableHead>
                <TableHead className="text-xs">Vị trí</TableHead>
                <TableHead className="text-xs">Mức độ</TableHead>
                <TableHead className="text-xs">Vấn đề chính</TableHead>
                <TableHead className="text-xs text-center">30 ngày</TableHead>
                <TableHead className="text-xs text-center">90 ngày</TableHead>
                <TableHead className="text-xs text-right">Chi phí</TableHead>
                <TableHead className="text-xs text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue) => {
                const severity = issue.count30d >= 3 ? severityConfig.critical : severityConfig.warning
                
                return (
                  <TableRow key={issue.id} className="hover:bg-muted/30">
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {issue.type === 'item' ? issue.item?.name : `Phòng ${issue.room?.room_number}`}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {issue.type === 'item' ? issue.item?.code : issue.room?.room_type}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {issue.location}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <span className={cn("flex items-center gap-1.5 text-xs", severity.color)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", severity.dot)} />
                        {severity.label}
                      </span>
                    </TableCell>
                    <TableCell className="py-2">
                      <div>
                        <p className="text-xs font-medium">{issueTypeLabels[issue.primaryIssue] || issue.primaryIssue}</p>
                        <p className="text-xs text-muted-foreground">{issue.issueCount} lần</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-center">
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium",
                        issue.count30d >= 3 ? "text-red-600" : "text-amber-600"
                      )}>
                        <TrendingUp className="h-3 w-3" />
                        {issue.count30d}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-center">
                      <span className="text-xs text-muted-foreground">{issue.count90d}</span>
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <div>
                        <p className="text-xs font-medium">{formatCurrency(issue.totalCost)}</p>
                        <p className="text-xs text-muted-foreground">TB: {formatCurrency(issue.avgCost)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7"
                          onClick={() => setSelectedIssue(issue)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Thêm tùy chọn">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedIssue(issue)}>
                              Phân tích chi tiết
                            </DropdownMenuItem>
                            <DropdownMenuItem>Tạo yêu cầu bảo trì</DropdownMenuItem>
                            <DropdownMenuItem>Đánh dấu đã xử lý</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <RecurringIssueAnalysisDialog
        issue={selectedIssue}
        open={!!selectedIssue}
        onOpenChange={(open) => !open && setSelectedIssue(null)}
      />
    </>
  )
}
