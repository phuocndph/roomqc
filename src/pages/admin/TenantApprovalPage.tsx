import { useState } from 'react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Check, X, Clock, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { usePendingTenants, useApproveTenant, useRejectTenant } from '@/hooks/super-admin/useTenantApproval'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/super-admin/shared/PageHeader'

export default function TenantApprovalPage() {
  const { user } = useAuth()
  const { data: pendingTenants, isLoading } = usePendingTenants()
  const approveMutation = useApproveTenant()
  const rejectMutation = useRejectTenant()

  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean
    tenantId: string
    tenantName: string
  }>({
    open: false,
    tenantId: '',
    tenantName: '',
  })
  const [rejectionReason, setRejectionReason] = useState('')

  const handleApprove = (tenantId: string) => {
    if (!user?.id) return
    approveMutation.mutate({ tenantId, adminId: user.id })
  }

  const handleRejectClick = (tenantId: string, tenantName: string) => {
    setRejectDialog({ open: true, tenantId, tenantName })
    setRejectionReason('')
  }

  const handleRejectConfirm = () => {
    if (!user?.id || !rejectDialog.tenantId) return
    rejectMutation.mutate({
      tenantId: rejectDialog.tenantId,
      adminId: user.id,
      reason: rejectionReason,
    })
    setRejectDialog({ open: false, tenantId: '', tenantName: '' })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Phê duyệt doanh nghiệp"
        description="Xét duyệt các đăng ký tài khoản Chủ sở hữu mới"
      />

      <div className="border rounded-lg">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Danh sách chờ phê duyệt</h3>
        </div>
        <div className="p-3">
          {isLoading ? (
            <LoadingSpinner />
          ) : !pendingTenants || pendingTenants.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Không có yêu cầu chờ duyệt"
              description="Hiện tại không có doanh nghiệp nào đang chờ phê duyệt"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tên doanh nghiệp</TableHead>
                    <TableHead className="text-xs">Chủ sở hữu</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Gói</TableHead>
                    <TableHead className="text-xs">Ngày đăng ký</TableHead>
                    <TableHead className="text-xs text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingTenants.map((tenant) => (
                    <TableRow key={tenant.tenant_id}>
                      <TableCell className="text-sm font-medium">
                        {tenant.tenant_name}
                      </TableCell>
                      <TableCell className="text-sm">{tenant.owner_name}</TableCell>
                      <TableCell className="text-sm">{tenant.owner_email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {tenant.subscription_tier}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(tenant.created_at), 'dd/MM/yyyy HH:mm', {
                          locale: vi,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="h-8"
                            onClick={() => handleApprove(tenant.tenant_id)}
                            disabled={approveMutation.isPending}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Phê duyệt
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8"
                            onClick={() =>
                              handleRejectClick(tenant.tenant_id, tenant.tenant_name)
                            }
                            disabled={rejectMutation.isPending}
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Từ chối
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={rejectDialog.open} onOpenChange={(open) => 
        setRejectDialog({ ...rejectDialog, open })
      }>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận từ chối</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn từ chối doanh nghiệp "{rejectDialog.tenantName}"?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Lý do từ chối</Label>
              <Textarea
                id="reason"
                placeholder="Nhập lý do từ chối..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialog({ open: false, tenantId: '', tenantName: '' })}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
            >
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
