import { useQuery, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Loader2, 
  ExternalLink, 
  CheckCircle2, 
  XCircle,
  RefreshCw,
  Bell,
  Info
} from 'lucide-react'
import { useUser } from '@/hooks/useUser'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/hooks/use-toast'

interface TelegramConnection {
  id: string
  chat_id: string
  chat_type: string
  username: string | null
  first_name: string | null
  is_active: boolean
  created_at: string
}

interface TelegramConnectionCardProps {
  compact?: boolean
}

export function TelegramConnectionCard({ compact = false }: TelegramConnectionCardProps) {
  const { user } = useUser()
  
  const BOT_USERNAME = 'roomqc_bot'
  const connectLink = user?.id 
    ? `https://t.me/${BOT_USERNAME}?start=${user.id}` 
    : ''

  // Fetch user's personal Telegram connection (for notifications)
  const { data: myConnection, isLoading, refetch: refetchConnection } = useQuery({
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

  // Disconnect personal Telegram (bot)
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
      toast({ title: 'Đã ngắt kết nối Telegram Bot' })
      refetchConnection()
    },
    onError: (error) => {
      toast({ title: 'Lỗi', description: String(error), variant: 'destructive' })
    }
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Bot Connection for Notifications */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bell className="h-4 w-4" />
          Kết nối Telegram
        </div>
        
        {myConnection ? (
          <div className="space-y-3">
            <div className={`flex ${compact ? 'flex-col gap-3' : 'items-center justify-between'}`}>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-sm">Đã kết nối</p>
                  <p className="text-xs text-muted-foreground">
                    {myConnection.first_name}
                    {myConnection.username && ` (@${myConnection.username})`}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">
                    ID: {myConnection.chat_id}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => refetchConnection()}
                  type="button"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  type="button"
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Ngắt kết nối'
                  )}
                </Button>
              </div>
            </div>
            
            {/* Info about direct contact */}
            <Alert className="bg-muted/50">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Đồng nghiệp có thể liên lạc trực tiếp với bạn qua nút Telegram trong trang <strong>Quản lý nhân sự</strong>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Chưa kết nối</p>
            </div>
            
            <Alert>
              <AlertDescription className="space-y-2">
                <p className="text-xs">Để kết nối Telegram:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Nhấn <strong>Mở Telegram</strong></li>
                  <li>Nhấn <strong>Start</strong> trong Telegram</li>
                  <li>Quay lại và nhấn <strong>Làm mới</strong></li>
                </ol>
              </AlertDescription>
            </Alert>
            
            <div className="flex gap-2">
              <Button size="sm" asChild>
                <a href={connectLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Mở Telegram
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetchConnection()} type="button">
                <RefreshCw className="h-4 w-4 mr-2" />
                Làm mới
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
