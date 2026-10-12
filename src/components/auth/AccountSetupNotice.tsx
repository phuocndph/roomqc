import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'

interface AccountSetupNoticeProps {
  assignmentRequired?: boolean
  onRetry: () => void
  isRetrying?: boolean
}

export function AccountSetupNotice({ assignmentRequired = false, onRetry, isRetrying = false }: AccountSetupNoticeProps) {
  const { signOut } = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 text-center" role="alert">
        <h1 className="text-xl font-semibold">
          {assignmentRequired ? 'Tài khoản chưa được gán khách sạn' : 'Chưa tải được thông tin tài khoản'}
        </h1>
        <p className="text-muted-foreground">
          {assignmentRequired
            ? 'Hãy liên hệ chủ khách sạn hoặc quản lý để được gán khách sạn và quyền truy cập, sau đó tải lại.'
            : 'Vui lòng kiểm tra kết nối và thử tải lại để tiếp tục.'}
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? 'Đang tải…' : 'Tải lại'}
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>Đăng xuất</Button>
        </div>
      </div>
    </div>
  )
}
