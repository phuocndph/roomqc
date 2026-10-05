import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { 
  Send, 
  Plus, 
  Loader2, 
  ExternalLink, 
  Users, 
  User, 
  CheckCircle2, 
  XCircle,
  MessageCircle,
  RefreshCw,
  ChevronDown
} from 'lucide-react'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/hooks/use-toast'
import { AddTelegramGroupDialog, EditTelegramGroupDialog, TelegramGroupCard, DEPARTMENTS } from '@/components/settings/telegram'

interface TelegramConnection {
  id: string
  chat_id: string
  chat_type: string
  username: string | null
  first_name: string | null
  is_active: boolean
  created_at: string
}

interface TelegramGroup {
  id: string
  chat_id: string
  chat_title: string
  group_type: string
  department: string | null
  notification_types: string[] | null
  hotel_id: string | null
  is_active: boolean
  created_at: string
  hotels?: { name: string } | null
}

export default function TelegramSettingsPage() {
  const { t } = useTranslation(['settings', 'common'])
  const { user, tenantId, hasAnyRole } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const isAdmin = hasAnyRole(['super_admin', 'owner', 'hotel_manager'])
  const queryClient = useQueryClient()
  
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<TelegramGroup | null>(null)
  const [testingSend, setTestingSend] = useState(false)
  const [expandedDepartments, setExpandedDepartments] = useState<string[]>(['housekeeping', 'maintenance', 'general'])

  // Bot info
  const BOT_USERNAME = 'roomqc_bot'
  
  // Generate connect link for user
  const connectLink = user?.id 
    ? `https://t.me/${BOT_USERNAME}?start=${user.id}` 
    : ''

  // Fetch user's personal Telegram connection
  const { data: myConnection, isLoading: loadingConnection, refetch: refetchConnection } = useQuery({
    queryKey: ['telegram-connection', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const { data, error } = await supabase
        .from('telegram_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
      
      if (error) throw error
      return data as TelegramConnection | null
    },
    enabled: !!user?.id
  })

  // Fetch tenant's Telegram groups (admin only)
  const { data: groups, isLoading: loadingGroups, refetch: refetchGroups } = useQuery({
    queryKey: ['telegram-groups', tenantId],
    queryFn: async () => {
      if (!tenantId) return []
      const { data, error } = await supabase
        .from('telegram_groups')
        .select('*, hotels(name)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data as TelegramGroup[]
    },
    enabled: !!tenantId && isAdmin
  })

  // Disconnect personal Telegram
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not found')
      const { error } = await supabase
        .from('telegram_connections')
        .update({ is_active: false })
        .eq('user_id', user.id)
      
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Đã ngắt kết nối Telegram' })
      refetchConnection()
    },
    onError: (error) => {
      toast({ title: 'Lỗi', description: String(error), variant: 'destructive' })
    }
  })

  // Add group
  const addGroupMutation = useMutation({
    mutationFn: async (data: {
      chatId: string
      title: string
      groupType: string
      department: string | null
      notificationTypes: string[]
      hotelId: string | null
    }) => {
      if (!tenantId) throw new Error('Missing tenant')
      
      const { error } = await supabase
        .from('telegram_groups')
        .insert({
          tenant_id: tenantId,
          hotel_id: data.hotelId,
          chat_id: data.chatId,
          chat_title: data.title,
          group_type: data.groupType,
          department: data.department,
          notification_types: data.notificationTypes.length > 0 ? data.notificationTypes : null,
          added_by: user?.id,
          is_active: true
        })
      
      if (error) {
        if (error.code === '23505') {
          throw new Error('Nhóm này đã được thêm trước đó')
        }
        throw error
      }
    },
    onSuccess: () => {
      toast({ title: 'Đã thêm nhóm Telegram' })
      setAddGroupOpen(false)
      refetchGroups()
    },
    onError: (error) => {
      toast({ title: 'Lỗi', description: String(error), variant: 'destructive' })
    }
  })

  // Filter and group by department
  const groupedByDepartment = useMemo(() => {
    if (!groups) return {}
    
    let filteredGroups = groups
    
    // Filter by selected hotel
    if (!isAllHotelsMode && selectedHotel) {
      filteredGroups = groups.filter(g => 
        g.hotel_id === selectedHotel.id || g.hotel_id === null
      )
    }
    
    // Group by department
    const grouped: Record<string, TelegramGroup[]> = {}
    
    filteredGroups.forEach(group => {
      const dept = group.department || 'no_department'
      if (!grouped[dept]) {
        grouped[dept] = []
      }
      grouped[dept].push(group)
    })
    
    return grouped
  }, [groups, selectedHotel, isAllHotelsMode])

  // Toggle group active
  const toggleGroupMutation = useMutation({
    mutationFn: async ({ groupId, isActive }: { groupId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('telegram_groups')
        .update({ is_active: isActive })
        .eq('id', groupId)
      
      if (error) throw error
    },
    onSuccess: () => {
      refetchGroups()
    }
  })

  // Delete group
  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase
        .from('telegram_groups')
        .delete()
        .eq('id', groupId)
      
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Đã xóa nhóm' })
      refetchGroups()
    }
  })

  // Update group
  const updateGroupMutation = useMutation({
    mutationFn: async ({ groupId, data }: {
      groupId: string
      data: {
        title: string
        groupType: string
        department: string | null
        notificationTypes: string[]
      }
    }) => {
      const { error } = await supabase
        .from('telegram_groups')
        .update({
          chat_title: data.title,
          group_type: data.groupType,
          department: data.department,
          notification_types: data.notificationTypes.length > 0 ? data.notificationTypes : null,
        })
        .eq('id', groupId)
      
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Đã cập nhật nhóm' })
      setEditingGroup(null)
      refetchGroups()
    },
    onError: (error) => {
      toast({ title: 'Lỗi', description: String(error), variant: 'destructive' })
    }
  })

  // Send test notification
  const handleTestNotification = async () => {
    if (!tenantId) return
    
    setTestingSend(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-telegram-notification', {
        body: {
          tenant_id: tenantId,
          user_ids: user?.id ? [user.id] : [],
          send_to_all_groups: true,
          title: '🔔 Test Notification',
          message: 'Đây là tin nhắn thử nghiệm từ RoomQc.\nNếu bạn nhận được tin này, kết nối đang hoạt động!',
          notification_type: 'system'
        }
      })
      
      if (error) throw error
      
      if (data.sent > 0) {
        toast({ 
          title: 'Đã gửi thông báo test', 
          description: `Gửi thành công đến ${data.sent}/${data.total} người nhận` 
        })
      } else {
        toast({ 
          title: 'Không có người nhận', 
          description: 'Chưa có tài khoản hoặc nhóm nào kết nối Telegram',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({ 
        title: 'Lỗi gửi thông báo', 
        description: String(error), 
        variant: 'destructive' 
      })
    } finally {
      setTestingSend(false)
    }
  }

  const toggleDepartment = (dept: string) => {
    setExpandedDepartments(prev =>
      prev.includes(dept)
        ? prev.filter(d => d !== dept)
        : [...prev, dept]
    )
  }

  const getDepartmentLabel = (dept: string) => {
    if (dept === 'no_department') return 'Không phân bộ phận'
    return DEPARTMENTS.find(d => d.value === dept)?.label || dept
  }

  const totalGroups = groups?.length || 0
  const activeGroups = groups?.filter(g => g.is_active).length || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6" />
            Cài đặt Telegram
          </h1>
          <p className="text-muted-foreground mt-1">
            Nhận thông báo tức thì qua Telegram Bot
          </p>
        </div>
        {isAdmin && (
          <Button 
            variant="outline" 
            onClick={handleTestNotification}
            disabled={testingSend}
          >
            {testingSend ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Gửi test
          </Button>
        )}
      </div>

      {/* Personal Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Kết nối cá nhân
          </CardTitle>
          <CardDescription>
            Kết nối Telegram để nhận thông báo trực tiếp cho riêng bạn
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingConnection ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải...
            </div>
          ) : myConnection ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium">Đã kết nối</p>
                  <p className="text-sm text-muted-foreground">
                    {myConnection.first_name}
                    {myConnection.username && ` (@${myConnection.username})`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => refetchConnection()}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Ngắt kết nối'
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <XCircle className="h-5 w-5 text-muted-foreground" />
                <p className="text-muted-foreground">Chưa kết nối Telegram</p>
              </div>
              
              <Alert>
                <AlertDescription className="space-y-3">
                  <p>Để kết nối, làm theo các bước sau:</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Nhấn nút bên dưới để mở Telegram</li>
                    <li>Nhấn <strong>Start</strong> trong Telegram</li>
                    <li>Quay lại đây và nhấn <strong>Làm mới</strong></li>
                  </ol>
                </AlertDescription>
              </Alert>
              
              <div className="flex gap-2">
                <Button asChild>
                  <a href={connectLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Mở Telegram
                  </a>
                </Button>
                <Button variant="outline" onClick={() => refetchConnection()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Làm mới
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Group Management (Admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Nhóm Telegram
                  {totalGroups > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {activeGroups}/{totalGroups} hoạt động
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Thêm nhóm Telegram để gửi thông báo cho nhiều người theo bộ phận
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setAddGroupOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Thêm nhóm
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingGroups ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải...
              </div>
            ) : Object.keys(groupedByDepartment).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(groupedByDepartment).map(([dept, deptGroups]) => (
                  <Collapsible
                    key={dept}
                    open={expandedDepartments.includes(dept)}
                    onOpenChange={() => toggleDepartment(dept)}
                  >
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center justify-between w-full p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={`h-4 w-4 transition-transform ${
                            expandedDepartments.includes(dept) ? '' : '-rotate-90'
                          }`} />
                          <span className="font-medium text-sm uppercase tracking-wide">
                            {getDepartmentLabel(dept)}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {deptGroups.length}
                          </Badge>
                        </div>
                        <Badge 
                          variant={deptGroups.some(g => g.is_active) ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {deptGroups.filter(g => g.is_active).length} hoạt động
                        </Badge>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 pl-2 space-y-2">
                      {deptGroups.map((group) => (
                        <TelegramGroupCard
                          key={group.id}
                          group={group}
                          tenantId={tenantId!}
                          onToggle={(id, active) => toggleGroupMutation.mutate({ groupId: id, isActive: active })}
                          onDelete={(id) => deleteGroupMutation.mutate(id)}
                          onEdit={(g) => setEditingGroup(g as TelegramGroup)}
                        />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Chưa có nhóm nào</p>
                <p className="text-sm mt-1">Thêm bot vào nhóm Telegram và nhập mã nhóm để bắt đầu</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Các loại thông báo nhận được</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2 list-disc pl-5 marker:text-muted-foreground">
            <li>Đặt phòng mới</li>
            <li>Nhận phòng / Trả phòng</li>
            <li>Yêu cầu bảo trì</li>
            <li>Cảnh báo kho hàng</li>
            <li>Cập nhật giặt là</li>
            <li>Thanh toán</li>
          </ul>
        </CardContent>
      </Card>

      {/* Add Group Dialog */}
      <AddTelegramGroupDialog
        open={addGroupOpen}
        onOpenChange={setAddGroupOpen}
        onSubmit={(data) => addGroupMutation.mutate(data)}
        isLoading={addGroupMutation.isPending}
        botUsername={BOT_USERNAME}
        selectedHotel={selectedHotel}
        isAllHotelsMode={isAllHotelsMode}
      />

      {/* Edit Group Dialog */}
      <EditTelegramGroupDialog
        open={!!editingGroup}
        onOpenChange={(open) => !open && setEditingGroup(null)}
        group={editingGroup}
        onSubmit={(groupId, data) => updateGroupMutation.mutate({ groupId, data })}
        isLoading={updateGroupMutation.isPending}
      />

    </div>
  )
}
