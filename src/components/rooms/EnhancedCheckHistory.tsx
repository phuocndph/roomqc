import { useState } from 'react'
import { CheckCircle, AlertTriangle, Star, Filter, TrendingUp, Image as ImageIcon, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { useUser } from '@/hooks/useUser'
import { isAdminUser, isManager } from '@/lib/userAccess'
import { ReopenCheckDialog } from './ReopenCheckDialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CheckoutReportCard } from './CheckoutReportCard'
import type { RoomCheckWithUser, CheckType } from '@/types/rooms.types'

interface EnhancedCheckHistoryProps {
  checks: RoomCheckWithUser[]
}

export function EnhancedCheckHistory({ checks }: EnhancedCheckHistoryProps) {
  const [filterType, setFilterType] = useState<CheckType | 'all'>('all')
  const [showChart, setShowChart] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([])
  const [showPhotoDialog, setShowPhotoDialog] = useState(false)
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null)
  const [reopenTarget, setReopenTarget] = useState<RoomCheckWithUser | null>(null)
  const { user } = useUser()
  const canReopen = isAdminUser(user) || isManager(user)
  
  // Filter checks by type
  const filteredChecks = filterType === 'all' 
    ? checks 
    : checks.filter(c => c.check_type === filterType)
  
  // Prepare chart data (last 10 checks)
  const chartData = [...checks].slice(0, 10).reverse().map((check, index) => ({
    name: `#${index + 1}`,
    score: check.cleanliness_score || 0,
    date: new Date(check.checked_at).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' }),
  }))
  
  // Find recurring issues (items that appear in missing/damaged multiple times)
  const findRecurringIssues = () => {
    const itemCounts: Record<string, number> = {}
    
    checks.forEach(check => {
      const allIssues = [
        ...(check.items_missing as any[] || []),
        ...(check.items_damaged as any[] || [])
      ]
      
      allIssues.forEach(item => {
        const key = item?.item_name || 'Unknown'
        itemCounts[key] = (itemCounts[key] || 0) + 1
      })
    })
    
    return Object.entries(itemCounts)
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
  }
  
  const recurringIssues = findRecurringIssues()
  
  if (checks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Chưa có lịch sử kiểm tra
      </p>
    )
  }
  
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterType} onValueChange={(v) => setFilterType(v as CheckType | 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Lọc theo loại" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="daily">Hàng ngày</SelectItem>
            <SelectItem value="checkin">Check-in</SelectItem>
            <SelectItem value="checkout">Check-out</SelectItem>
            <SelectItem value="maintenance">Bảo trì</SelectItem>
          </SelectContent>
        </Select>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowChart(!showChart)}
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          {showChart ? 'Ẩn biểu đồ' : 'Xem xu hướng'}
        </Button>
      </div>
      
      {/* Trend Chart */}
      {showChart && checks.length >= 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Xu hướng điểm sạch sẽ</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="score" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      
      {/* Recurring Issues Alert */}
      {recurringIssues.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Vấn đề lặp lại
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {recurringIssues.map(([itemName, count]) => (
                <div key={itemName} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{itemName}</span>
                  <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                    {count} lần
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Check History List */}
      <div className="space-y-3">
        <p className="text-sm font-medium">
          Hiển thị {filteredChecks.length}/{checks.length} lần kiểm tra
        </p>
        
        {filteredChecks.map((check) => {
          const isCheckout = check.check_type === 'checkout'
          const isExpanded = expandedCheckId === check.id
          const hasCheckoutData = isCheckout && (
            (check as any).items_consumed?.length > 0 ||
            (check as any).items_lost?.length > 0 ||
            (check.items_damaged as any[])?.length > 0
          )
          
          return (
            <div key={check.id} className="pb-3 border-b last:border-0">
              <div className="flex gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={check.checked_by_avatar || undefined} />
                  <AvatarFallback>
                    {check.checked_by_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{check.checked_by_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(check.checked_at), { addSuffix: true, locale: vi })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={isCheckout ? 'default' : 'outline'} 
                        className={`text-xs ${isCheckout ? 'bg-orange-500' : ''}`}
                      >
                        {check.check_type === 'daily' && 'Hàng ngày'}
                        {check.check_type === 'checkin' && 'Check-in'}
                        {check.check_type === 'checkout' && 'Check-out'}
                        {check.check_type === 'maintenance' && 'Bảo trì'}
                      </Badge>
                      {isCheckout && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setExpandedCheckId(isExpanded ? null : check.id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {check.cleanliness_score && (
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3 w-3 ${
                            i < check.cleanliness_score!
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-muted'
                          }`}
                        />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">
                        {check.cleanliness_score}/5
                      </span>
                    </div>
                  )}
                  
                  {check.items_complete ? (
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle className="h-3 w-3" />
                      <span>Đồ dùng đầy đủ</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-red-600">
                      <AlertTriangle className="h-3 w-3" />
                      <span>
                        Thiếu {(check.items_missing as any[])?.length || 0} items
                        {(check.items_damaged as any[])?.length > 0 && 
                          `, hư ${(check.items_damaged as any[]).length} items`
                        }
                      </span>
                    </div>
                  )}
                  
                  {check.notes && (
                    <p className="text-xs text-muted-foreground">
                      {check.notes}
                    </p>
                  )}

                  {/* Status + Reopen action */}
                  {(() => {
                    const status = (check as any).status as string | undefined
                    const isReopened = status === 'reopened'
                    const isUndone = status === 'undone'
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        {isReopened && (
                          <span className="text-xs text-amber-600 font-medium">
                            Đã mở lại — chờ kiểm lại
                          </span>
                        )}
                        {isUndone && (
                          <span className="text-xs text-muted-foreground italic">
                            Đã hoàn tác
                          </span>
                        )}
                        {canReopen && !isReopened && !isUndone && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setReopenTarget(check)}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Mở lại
                          </Button>
                        )}
                      </div>
                    )
                  })()}


                  {check.photos && Array.isArray(check.photos) && check.photos.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ImageIcon className="h-3 w-3" />
                        <span>{check.photos.length} ảnh</span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {check.photos.slice(0, 4).map((photo: string, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setSelectedPhotos(check.photos as string[])
                              setShowPhotoDialog(true)
                            }}
                            className="relative w-16 h-16 rounded border overflow-hidden hover:opacity-80 transition-opacity"
                          >
                            <img 
                              src={photo} 
                              alt={`Photo ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                        {check.photos.length > 4 && (
                          <button
                            onClick={() => {
                              setSelectedPhotos(check.photos as string[])
                              setShowPhotoDialog(true)
                            }}
                            className="w-16 h-16 rounded border flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors"
                          >
                            <span className="text-xs font-medium">+{check.photos.length - 4}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Checkout Report Card - expandable */}
                  {isCheckout && isExpanded && (
                    <div className="mt-3">
                      <CheckoutReportCard
                        items_consumed={(check as any).items_consumed}
                        items_lost={(check as any).items_lost}
                        items_damaged={check.items_damaged as any[]}
                      />
                    </div>
                  )}
                  
                  {/* Show hint to expand for checkout checks with data */}
                  {isCheckout && !isExpanded && hasCheckoutData && (
                    <button
                      onClick={() => setExpandedCheckId(check.id)}
                      className="text-xs text-orange-600 hover:underline"
                    >
                      Xem báo cáo checkout chi tiết →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      
      {/* Photo Viewer Dialog */}
      <Dialog open={showPhotoDialog} onOpenChange={setShowPhotoDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Ảnh kiểm tra phòng</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto">
            {selectedPhotos.map((photo, idx) => (
              <a
                key={idx}
                href={photo}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-square rounded-lg overflow-hidden border hover:border-primary transition-colors group"
              >
                <img 
                  src={photo} 
                  alt={`Photo ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reopen Dialog */}
      {reopenTarget && (
        <ReopenCheckDialog
          checkId={reopenTarget.id}
          checkedByName={reopenTarget.checked_by_name}
          checkedAt={reopenTarget.checked_at}
          open={!!reopenTarget}
          onOpenChange={(v) => { if (!v) setReopenTarget(null) }}
        />
      )}
    </div>
    </div>
  )
}
