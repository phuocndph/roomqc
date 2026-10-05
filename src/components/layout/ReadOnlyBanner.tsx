import { useReadOnlyMode } from '@/hooks/useReadOnlyMode'
import { Lock } from 'lucide-react'
import { Link } from 'react-router-dom'

/**
 * Banner vàng hiển thị khi tenant đang ở chế độ chỉ đọc.
 * - Cho phép xem dữ liệu, mọi mutation sẽ bị chặn ở DB.
 * - Hiển thị lý do và link gia hạn.
 */
export function ReadOnlyBanner() {
  const { isReadOnly, reason } = useReadOnlyMode()

  if (!isReadOnly) return null

  return (
    <div className="border-b bg-amber-50 text-amber-900 px-4 py-2 text-sm flex items-start gap-2">
      <Lock className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium">Chế độ chỉ đọc</div>
        <div className="text-xs text-amber-800">
          {reason || 'Tài khoản đang ở chế độ chỉ đọc. Bạn vẫn có thể xem dữ liệu nhưng không thể tạo/sửa/xóa.'}
        </div>
      </div>
      <Link
        to="/settings/subscription"
        className="shrink-0 text-xs font-medium underline hover:no-underline"
      >
        Gia hạn ngay
      </Link>
    </div>
  )
}
