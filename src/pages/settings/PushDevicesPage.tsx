import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Badge } from '@/components/ui/badge'
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { 
  Smartphone, 
  Monitor, 
  Tablet, 
  Trash2, 
  RefreshCw, 
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

interface PushDevice {
  id: string
  device_name: string | null
  user_agent: string | null
  is_active: boolean
  failed_count: number
  last_used_at: string | null
  created_at: string
  endpoint: string
}

function getDeviceIcon(userAgent: string | null) {
  if (!userAgent) return <Monitor className="h-5 w-5" />
  const ua = userAgent.toLowerCase()
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return <Smartphone className="h-5 w-5" />
  }
  if (ua.includes('ipad') || ua.includes('tablet')) {
    return <Tablet className="h-5 w-5" />
  }
  return <Monitor className="h-5 w-5" />
}

function getDeviceType(userAgent: string | null): string {
  if (!userAgent) return 'Không xác định'
  const ua = userAgent.toLowerCase()
  if (ua.includes('iphone')) return 'iPhone'
  if (ua.includes('ipad')) return 'iPad'
  if (ua.includes('android')) {
    if (ua.includes('mobile')) return 'Android Phone'
    return 'Android Tablet'
  }
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac'
  if (ua.includes('windows')) return 'Windows PC'
  if (ua.includes('linux')) return 'Linux'
  return 'Trình duyệt web'
}

function getBrowserName(userAgent: string | null): string {
  if (!userAgent) return ''
  const ua = userAgent.toLowerCase()
  if (ua.includes('edg/')) return 'Edge'
  if (ua.includes('chrome')) return 'Chrome'
  if (ua.includes('firefox')) return 'Firefox'
  if (ua.includes('safari')) return 'Safari'
  if (ua.includes('opera')) return 'Opera'
  return ''
}

export default function PushDevicesPage() {
  const { t } = useTranslation(['settings', 'common'])
  const { user, tenantId } = useUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteDevice, setDeleteDevice] = useState<PushDevice | null>(null)
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null)

  // Get current device's push subscription endpoint
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setCurrentEndpoint(sub?.endpoint || null)
        })
      }).catch(console.error)
    }
  }, [])

  const { data: devices, isLoading, refetch } = useQuery({
    queryKey: ['push-devices', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id, device_name, user_agent, is_active, failed_count, last_used_at, created_at, endpoint')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data as PushDevice[]
    },
    enabled: !!user?.id
  })

  const deleteMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('id', deviceId)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-devices'] })
      toast({ title: 'Đã xóa thiết bị', description: 'Thiết bị đã được xóa khỏi danh sách đăng ký' })
      setDeleteDevice(null)
    },
    onError: () => {
      toast({ title: 'Lỗi', description: 'Không thể xóa thiết bị', variant: 'destructive' })
    }
  })

  const deleteAllInactiveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('is_active', false)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-devices'] })
      toast({ title: 'Đã xóa thiết bị không hoạt động', description: 'Tất cả thiết bị không còn hoạt động đã được xóa' })
    },
    onError: () => {
      toast({ title: 'Lỗi', description: 'Không thể xóa thiết bị', variant: 'destructive' })
    }
  })

  const activeDevices = devices?.filter(d => d.is_active) || []
  const inactiveDevices = devices?.filter(d => !d.is_active) || []

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/settings/notifications')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Quản lý thiết bị Push</h1>
            <p className="text-muted-foreground">
              Xem và quản lý các thiết bị đã đăng ký nhận thông báo đẩy
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {inactiveDevices.length > 0 && (
            <PermissionGate module="settings" action="delete">
              <Button
                variant="outline"
                onClick={() => deleteAllInactiveMutation.mutate()}
                disabled={deleteAllInactiveMutation.isPending}
              >
                {deleteAllInactiveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Trash2 className="h-4 w-4 mr-2" />
                Xóa thiết bị không hoạt động ({inactiveDevices.length})
              </Button>
            </PermissionGate>
          )}
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Làm mới
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : devices?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Chưa có thiết bị nào</h3>
            <p className="text-muted-foreground mb-4">
              Bạn chưa đăng ký thiết bị nào để nhận thông báo đẩy
            </p>
            <Button onClick={() => navigate('/settings/notifications')}>
              Đăng ký thiết bị
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Active Devices */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Thiết bị đang hoạt động ({activeDevices.length})
              </CardTitle>
              <CardDescription>
                Các thiết bị đang nhận thông báo đẩy
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeDevices.length === 0 ? (
                <p className="text-muted-foreground text-sm">Không có thiết bị nào đang hoạt động</p>
              ) : (
                <div className="space-y-3">
                  {activeDevices.map((device) => (
                    <DeviceItem
                      key={device.id}
                      device={device}
                      onDelete={() => setDeleteDevice(device)}
                      isCurrentDevice={device.endpoint === currentEndpoint}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inactive Devices */}
          {inactiveDevices.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-destructive" />
                  Thiết bị không hoạt động ({inactiveDevices.length})
                </CardTitle>
                <CardDescription>
                  Các thiết bị đã ngừng nhận thông báo hoặc gặp lỗi
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {inactiveDevices.map((device) => (
                    <DeviceItem
                      key={device.id}
                      device={device}
                      onDelete={() => setDeleteDevice(device)}
                      isCurrentDevice={device.endpoint === currentEndpoint}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDevice} onOpenChange={() => setDeleteDevice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa thiết bị?</AlertDialogTitle>
            <AlertDialogDescription>
              Thiết bị "{deleteDevice?.device_name || getDeviceType(deleteDevice?.user_agent)}" sẽ không còn nhận được thông báo đẩy. 
              Bạn có thể đăng ký lại thiết bị này sau.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDevice && deleteMutation.mutate(deleteDevice.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Xóa thiết bị
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DeviceItem({ device, onDelete, isCurrentDevice }: { device: PushDevice; onDelete: () => void; isCurrentDevice?: boolean }) {
  const deviceType = getDeviceType(device.user_agent)
  const browser = getBrowserName(device.user_agent)
  const displayName = device.device_name || `${deviceType}${browser ? ` (${browser})` : ''}`

  return (
    <div className={`flex items-center justify-between p-4 border rounded-lg bg-card ${isCurrentDevice ? 'ring-2 ring-primary/50' : ''}`}>
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-full ${device.is_active ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
          {getDeviceIcon(device.user_agent)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{displayName}</span>
            {isCurrentDevice && (
              <Badge variant="secondary" className="text-xs">Thiết bị này</Badge>
            )}
            {!device.is_active && (
              <Badge variant="destructive" className="text-xs">Không hoạt động</Badge>
            )}
            {device.failed_count > 0 && (
              <Badge variant="outline" className="text-xs text-amber-600">
                Lỗi: {device.failed_count}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Đăng ký: {format(new Date(device.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
            </span>
            {device.last_used_at && (
              <span>
                • Dùng lần cuối: {format(new Date(device.last_used_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
              </span>
            )}
          </div>
        </div>
      </div>
      <PermissionGate module="settings" action="delete">
        <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive hover:text-destructive" aria-label="Xóa">
          <Trash2 className="h-4 w-4" />
        </Button>
      </PermissionGate>
    </div>
  )
}
