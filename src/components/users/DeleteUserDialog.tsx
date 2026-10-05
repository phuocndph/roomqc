import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteUser } from '@/hooks/useUsers'
import { useHasSubordinates } from '@/hooks/useSubordinates'
import { UserWithRelations } from '@/types/database.types'
import { AlertTriangle, Users, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface DeleteUserDialogProps {
  user: UserWithRelations | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteUserDialog({ user, open, onOpenChange }: DeleteUserDialogProps) {
  const deleteUser = useDeleteUser()
  const { data: hasSubordinates, isLoading: checkingSubordinates } = useHasSubordinates(user?.id || '')
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!user) return

    setIsDeleting(true)
    try {
      await deleteUser.mutateAsync(user.id)
      onOpenChange(false)
    } catch (error) {
      // Error is handled by the hook
    } finally {
      setIsDeleting(false)
    }
  }

  if (!user) return null

  const isPrimaryOwner = user.is_primary_owner
  const isOwner = user.user_level_code === 'tenant_owner'

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {isPrimaryOwner ? 'Không thể xóa Chủ sở hữu chính' : 'Xác nhận xóa người dùng'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {isPrimaryOwner ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{user.full_name}</strong> là Chủ sở hữu chính của doanh nghiệp. 
                    Bạn không thể xóa tài khoản này vì nó có toàn quyền quản lý hệ thống.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <p>
                    Bạn có chắc chắn muốn xóa người dùng{' '}
                    <strong className="text-foreground">{user.full_name}</strong> ({user.email})?
                  </p>

                  {checkingSubordinates ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang kiểm tra người dùng liên quan...
                    </div>
                  ) : hasSubordinates ? (
                    <Alert>
                      <Users className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Lưu ý quan trọng:</strong> Người dùng này đã tạo các tài khoản khác trong hệ thống. 
                        Khi xóa, các tài khoản đó sẽ được chuyển cho người quản lý cấp cao hơn hoặc trở thành tài khoản độc lập.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {isOwner && !isPrimaryOwner && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Người dùng này có cấp bậc <strong>Chủ sở hữu</strong>. 
                        Việc xóa tài khoản này sẽ ảnh hưởng đến hệ thống quản lý.
                      </AlertDescription>
                    </Alert>
                  )}

                  <p className="text-sm text-muted-foreground">
                    Hành động này không thể hoàn tác.
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {isPrimaryOwner ? 'Đóng' : 'Hủy'}
          </AlertDialogCancel>
          {!isPrimaryOwner && (
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang xóa...
                </>
              ) : (
                'Xóa người dùng'
              )}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
