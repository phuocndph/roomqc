import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  Calendar,
  ExternalLink,
  Wrench,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'

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
  requests?: any[]
}

interface RecurringIssueAnalysisDialogProps {
  issue: RecurringIssue | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  waiting: { label: 'Chờ xử lý', variant: 'outline' },
  pending: { label: 'Đã tiếp nhận', variant: 'secondary' },
  in_progress: { label: 'Đang xử lý', variant: 'default' },
  completed: { label: 'Hoàn thành', variant: 'default' },
  cancelled: { label: 'Đã hủy', variant: 'destructive' },
}

const issueTypeLabels: Record<string, string> = {
  repair: 'Sửa chữa',
  replace: 'Thay thế',
  inspection: 'Kiểm tra',
  cleaning: 'Vệ sinh',
  other: 'Khác',
}

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-success" />
    case 'in_progress':
      return <Clock className="h-4 w-4 text-primary" />
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-destructive" />
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />
  }
}

export const RecurringIssueAnalysisDialog = ({
  issue,
  open,
  onOpenChange
}: RecurringIssueAnalysisDialogProps) => {
  const navigate = useNavigate()

  if (!issue) return null

  // Prepare timeline data
  const timelineData = issue.requests
    ?.slice()
    .sort((a, b) => new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime())
    .map((req, index) => ({
      name: format(new Date(req.reported_at), 'dd/MM', { locale: vi }),
      incident: index + 1,
      cost: req.actual_cost || req.estimated_cost || 0,
    })) || []

  // Calculate insights
  const avgTimeBetweenIssues = issue.count90d > 1 
    ? Math.round(90 / issue.count90d) 
    : 0

  const costTrend = timelineData.length > 1
    ? timelineData[timelineData.length - 1].cost > timelineData[0].cost
      ? 'tăng'
      : 'giảm'
    : 'ổn định'

  const replacementEstimate = issue.type === 'item' && issue.item?.unit_price
    ? issue.item.unit_price
    : issue.avgCost * 10

  const shouldReplace = issue.totalCost > replacementEstimate * 0.7

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-6 w-6 text-warning" />
            </div>
            <div className="flex-1">
              <div className="text-xl font-semibold">
                {issue.type === 'item' ? issue.item?.name : `Phòng ${issue.room?.room_number}`}
              </div>
              <div className="text-sm text-muted-foreground font-normal">
                {issue.type === 'item' && issue.item?.code} • {issue.location}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-3 mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{issue.count30d}</div>
                  <div className="text-sm text-muted-foreground">Lần (30 ngày)</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{issue.frequency}</div>
                  <div className="text-sm text-muted-foreground">Lần/tháng</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{formatCurrency(issue.totalCost)}</div>
                  <div className="text-sm text-muted-foreground">Tổng chi phí</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline Chart */}
        {timelineData.length > 0 && (
          <Card className="mt-4">
            <CardContent className="pt-6">
              <div className="text-sm font-medium mb-4">Timeline sự cố</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="name" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="incident" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    name="Số lần"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Requests Table */}
        <Card className="mt-4">
          <CardContent className="pt-6">
            <div className="text-sm font-medium mb-4">
              Danh sách yêu cầu ({issue.requests?.length || 0})
            </div>
            <div className="space-y-2">
              {issue.requests?.slice(0, 10).map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <StatusIcon status={req.status} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{req.title}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>{format(new Date(req.reported_at), 'dd/MM/yyyy', { locale: vi })}</span>
                        <span>•</span>
                        <span>{issueTypeLabels[req.issue_type] || req.issue_type}</span>
                        {req.actual_cost && (
                          <>
                            <span>•</span>
                            <span className="font-medium">{formatCurrency(req.actual_cost)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant={statusLabels[req.status]?.variant || 'outline'}>
                      {statusLabels[req.status]?.label || req.status}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigate(`/maintenance/requests/${req.id}`)
                      onOpenChange(false)
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recommendations */}
        <Card className="mt-4 border-warning/50 bg-warning/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center shrink-0">
                <Wrench className="h-5 w-5 text-warning" />
              </div>
              <div className="flex-1">
                <div className="font-semibold mb-2">Phân tích & Đề xuất</div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>
                    • Trung bình <strong className="text-foreground">{avgTimeBetweenIssues} ngày</strong> giữa các lần sự cố
                  </div>
                  <div>
                    • Chi phí trung bình: <strong className="text-foreground">{formatCurrency(issue.avgCost)}</strong>/lần
                  </div>
                  <div>
                    • Xu hướng chi phí: <strong className="text-foreground">{costTrend}</strong>
                  </div>
                  
                  {issue.count30d >= 3 ? (
                    <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <div className="font-semibold text-destructive mb-1">⚠️ Cảnh báo nghiêm trọng</div>
                      <div className="text-destructive/90">
                        Tần suất sự cố cao bất thường ({issue.count30d} lần trong 30 ngày).
                        {shouldReplace && (
                          <span className="block mt-2">
                            💡 <strong>Đề xuất:</strong> Chi phí sửa chữa ({formatCurrency(issue.totalCost)}) đã vượt 70% 
                            giá trị thay thế ước tính ({formatCurrency(replacementEstimate)}). 
                            <strong> Nên xem xét thay thế {issue.type === 'item' ? 'thiết bị' : 'trang thiết bị phòng'} mới.</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <div className="font-semibold text-primary mb-1">📋 Khuyến nghị</div>
                      <div className="text-primary/90">
                        Theo dõi thêm để xác định xu hướng. Nếu tình trạng tiếp tục, cần điều tra nguyên nhân gốc rễ.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}
