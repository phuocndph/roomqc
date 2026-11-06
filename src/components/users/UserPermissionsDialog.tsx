import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UserPermissionPanel } from '@/components/permissions/UserPermissionPanel'
import type { UserWithRelations } from '@/types/database.types'

export function UserPermissionsDialog({ user, open, onOpenChange }: {
  user: UserWithRelations | null; open: boolean; onOpenChange: (open: boolean) => void
}) {
  if (!user || !open) return null
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>Phân quyền nhân viên</DialogTitle>
        <DialogDescription>Quản lý quyền bổ sung và phân công khách sạn cho {user.full_name}.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto"><UserPermissionPanel user={user} /></div>
      <div className="flex justify-end border-t pt-3"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button></div>
    </DialogContent>
  </Dialog>
}
