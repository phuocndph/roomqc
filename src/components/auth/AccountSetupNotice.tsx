import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { runtimeConfig } from '@/lib/runtime-config'
import { AccountProfileError } from '@/lib/account-profile-error'

interface AccountSetupNoticeProps {
  assignmentRequired?: boolean
  onRetry: () => void
  isRetrying?: boolean
  error?: unknown
}

export function AccountSetupNotice({ assignmentRequired = false, onRetry, isRetrying = false, error }: AccountSetupNoticeProps) {
  const { signOut } = useAuth()
  const mismatch = error instanceof AccountProfileError && error.code === 'workspace_mismatch'
  const unconfirmed = error instanceof AccountProfileError && error.code === 'workspace_unconfirmed'
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 text-center" role="alert">
        <h1 className="text-xl font-semibold">
          {mismatch ? 'Tài khoản không thuộc doanh nghiệp này' : unconfirmed ? 'Doanh nghiệp chưa xác nhận thiết lập'
            : assignmentRequired ? 'Tài khoản chưa được gán khách sạn' : 'Chưa tải được thông tin tài khoản'}
        </h1>
        <p className="text-muted-foreground">
          {mismatch ? 'Hãy chọn đúng doanh nghiệp hoặc đăng xuất để dùng tài khoản khác.'
            : unconfirmed ? 'Hãy tải lại trang để kiểm tra kết quả thiết lập trước khi tiếp tục.'
            : assignmentRequired
            ? 'Hãy liên hệ chủ khách sạn hoặc quản lý để được gán khách sạn và quyền truy cập, sau đó tải lại.'
            : 'Vui lòng kiểm tra kết nối và thử tải lại để tiếp tục.'}
        </p>
        <div className="flex justify-center gap-3">
          {mismatch ? <Button asChild><a href="/start?mode=login">Chọn doanh nghiệp khác</a></Button> : <Button onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? 'Đang tải…' : 'Tải lại'}
          </Button>}
          <Button variant="outline" onClick={() => void signOut()}>Đăng xuất</Button>
        </div>
        {runtimeConfig.workspace && <p className="text-sm">{mismatch ? 'Doanh nghiệp đang mở: ' : 'Kiểm tra bạn đang dùng tài khoản của '}<strong>{runtimeConfig.workspace.workspace.displayName}</strong>. {!mismatch && <a href="/start?mode=login" className="text-blue-700 underline">Chọn doanh nghiệp khác</a>}</p>}
      </div>
    </div>
  )
}
