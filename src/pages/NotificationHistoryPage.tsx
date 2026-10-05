import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'
import { 
  Bell, 
  Check, 
  CheckCheck,
  Trash2, 
  AlertTriangle, 
  Package, 
  Shirt, 
  Wrench,
  ShoppingCart,
  Info,
  Clock,
  X
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { useIsMobile } from '@/hooks/use-mobile'

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  low_stock: { icon: Package, color: 'text-yellow-500', label: 'Tồn kho thấp' },
  critical_stock: { icon: AlertTriangle, color: 'text-red-500', label: 'Tồn kho nguy hiểm' },
  laundry_completed: { icon: Shirt, color: 'text-green-500', label: 'Giặt xong' },
  maintenance_new: { icon: Wrench, color: 'text-blue-500', label: 'Bảo trì mới' },
  maintenance_overdue: { icon: Wrench, color: 'text-red-500', label: 'Bảo trì quá hạn' },
  po_approved: { icon: ShoppingCart, color: 'text-green-500', label: 'Đơn hàng duyệt' },
  task_assigned: { icon: Check, color: 'text-purple-500', label: 'Công việc' },
  approval_request: { icon: Clock, color: 'text-orange-500', label: 'Chờ duyệt' },
  info: { icon: Info, color: 'text-blue-500', label: 'Thông tin' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', label: 'Cảnh báo' },
  success: { icon: Check, color: 'text-green-500', label: 'Thành công' },
  error: { icon: X, color: 'text-red-500', label: 'Lỗi' },
}

export default function NotificationHistoryPage() {
  const { user } = useUser()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<'all' | 'unread' | 'read'>('all')

  // Fetch notifications
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notification-history', user?.id, tab],
    queryFn: async () => {
      if (!user?.id) return []
      
      let query = supabase
        .from('in_app_notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      
      if (tab === 'unread') {
        query = query.eq('is_read', false)
      } else if (tab === 'read') {
        query = query.eq('is_read', true)
      }
      
      const { data, error } = await query
      if (error) throw error
      return data
    },
    enabled: !!user?.id,
  })

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-history'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-history'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      toast({ title: 'Đã đánh dấu tất cả là đã đọc' })
    },
  })

  // Delete notification mutation
  const deleteMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('in_app_notifications')
        .delete()
        .eq('id', notificationId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-history'] })
      toast({ title: 'Đã xóa thông báo' })
    },
  })

  // Clear all read notifications
  const clearReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return
      const { error } = await supabase
        .from('in_app_notifications')
        .delete()
        .eq('user_id', user.id)
        .eq('is_read', true)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-history'] })
      toast({ title: 'Đã xóa tất cả thông báo đã đọc' })
    },
  })

  const handleNotificationClick = (notification: any) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id)
    }
    if (notification.action_url) {
      navigate(notification.action_url)
    }
  }

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lịch sử thông báo</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : 'Không có thông báo mới'}
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              {isMobile ? '' : 'Đánh dấu tất cả đã đọc'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">Tất cả</TabsTrigger>
          <TabsTrigger value="unread">
            Chưa đọc
            {unreadCount > 0 && (
              <Badge variant="secondary" className="ml-2">{unreadCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="read">Đã đọc</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {tab === 'all' ? 'Tất cả thông báo' : tab === 'unread' ? 'Chưa đọc' : 'Đã đọc'}
                </CardTitle>
                {tab === 'read' && (notifications?.filter(n => n.is_read).length || 0) > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => clearReadMutation.mutate()}
                    disabled={clearReadMutation.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Xóa tất cả
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-4 p-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Bell className="h-12 w-12 mb-4 opacity-50" />
                  <p>Không có thông báo nào</p>
                </div>
              ) : (
                <ScrollArea className={isMobile ? 'h-[60vh]' : 'h-[500px]'}>
                  <div className="space-y-2">
                    {notifications?.map((notification) => {
                      const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.info
                      const Icon = config.icon
                      
                      return (
                        <div
                          key={notification.id}
                          className={`flex items-start gap-4 p-4 rounded-lg cursor-pointer transition-colors ${
                            notification.is_read 
                              ? 'bg-muted/30 hover:bg-muted/50' 
                              : 'bg-primary/5 hover:bg-primary/10 border-l-4 border-primary'
                          }`}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className={`p-2 rounded-full bg-background ${config.color}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className={`font-medium ${notification.is_read ? 'text-muted-foreground' : ''}`}>
                                {notification.title}
                              </p>
                              <Badge variant="outline" className="text-xs">
                                {config.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {notification.body}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(notification.created_at), { 
                                addSuffix: true, 
                                locale: vi 
                              })}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteMutation.mutate(notification.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
