import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DeleteTenantDialogProps {
  tenant: { name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Compatibility for old callers: never offer an irreversible delete.
export function DeleteTenantDialog({ tenant, open, onOpenChange }: DeleteTenantDialogProps) {
  if (!tenant) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chưa hỗ trợ xóa khách hàng</DialogTitle>
          <DialogDescription>
            Không xóa vĩnh viễn {tenant.name} từ giao diện. Cần có quy trình xuất dữ liệu,
            thời hạn lưu và phê duyệt trước khi xóa. Có thể tạm ngưng quyền truy cập thay thế.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
