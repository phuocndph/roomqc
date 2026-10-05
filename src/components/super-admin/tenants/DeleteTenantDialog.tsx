import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useDeleteTenant } from '@/hooks/super-admin/useTenants';

interface DeleteTenantDialogProps {
  tenant: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteTenantDialog({
  tenant,
  open,
  onOpenChange,
}: DeleteTenantDialogProps) {
  const { t } = useTranslation('superAdmin');
  const [confirmText, setConfirmText] = useState('');
  const deleteMutation = useDeleteTenant();

  const handleDelete = () => {
    if (!tenant || confirmText !== tenant.name) return;

    deleteMutation.mutate(tenant.id, {
      onSuccess: () => {
        onOpenChange(false);
        setConfirmText('');
      },
    });
  };

  if (!tenant) return null;

  const isConfirmed = confirmText === tenant.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">{t('tenants.delete.title')}</DialogTitle>
          <DialogDescription>
            {t('tenants.delete.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>{t('tenants.delete.warning')}:</strong> {t('tenants.delete.willDelete')}:
              <ul className="list-disc list-inside mt-2 text-sm">
                <li>{t('tenants.delete.allHotels')}</li>
                <li>{t('tenants.delete.allItems')}</li>
                <li>{t('tenants.delete.allUsers')}</li>
                <li>{t('tenants.delete.allTransactions')}</li>
                <li>{t('tenants.delete.allFiles')}</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border p-3 bg-muted/30">
            <div className="text-sm text-muted-foreground">{t('tenants.delete.tenantToDelete')}</div>
            <div className="font-medium text-foreground">{tenant.name}</div>
            <div className="text-sm text-muted-foreground">{tenant.primary_contact_email}</div>
          </div>

          <div className="space-y-2">
            <Label>
              {t('tenants.delete.typeToConfirm')} <code className="text-destructive font-mono bg-muted px-1 py-0.5 rounded">{tenant.name}</code>
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={tenant.name}
              className="font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            onOpenChange(false);
            setConfirmText('');
          }}>
            {t('tenants.dialogs.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || deleteMutation.isPending}
          >
            {deleteMutation.isPending ? t('tenants.delete.deleting') : t('tenants.delete.deletePermanently')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
