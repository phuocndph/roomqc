import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Mail, 
  XCircle, 
  PlayCircle, 
  Trash2,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface BulkActionsProps {
  selectedTenants: string[];
  onClearSelection: () => void;
}

export function BulkActions({ selectedTenants, onClearSelection }: BulkActionsProps) {
  const { t } = useTranslation('superAdmin');
  const { toast } = useToast();

  const handleSendEmail = () => {
    toast({
      title: t('tenants.toasts.emailsSent'),
      description: t('tenants.toasts.emailsSentDesc', { count: selectedTenants.length }),
    });
  };

  const handleSuspend = () => {
    toast({
      title: t('tenants.toasts.tenantsSuspended'),
      description: t('tenants.toasts.tenantsSuspendedDesc', { count: selectedTenants.length }),
    });
    onClearSelection();
  };

  const handleReactivate = () => {
    toast({
      title: t('tenants.toasts.tenantsReactivated'),
      description: t('tenants.toasts.tenantsReactivatedDesc', { count: selectedTenants.length }),
    });
    onClearSelection();
  };

  const handleDelete = () => {
    toast({
      title: t('tenants.toasts.tenantsDeleted'),
      description: t('tenants.toasts.tenantsDeletedDesc', { count: selectedTenants.length }),
      variant: 'destructive',
    });
    onClearSelection();
  };

  return (
    <Card className="border-primary">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-base px-3 py-1">
              {t('tenants.bulk.selected', { count: selectedTenants.length })}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
            >
              <X className="h-4 w-4 mr-1" />
              {t('tenants.bulk.clear')}
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendEmail}
            >
              <Mail className="h-4 w-4 mr-2" />
              {t('tenants.bulk.sendEmail')}
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {t('tenants.bulk.suspend')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('tenants.dialogs.suspendTenantsTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('tenants.dialogs.suspendTenantsDescription', { count: selectedTenants.length })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('tenants.dialogs.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSuspend}>
                    {t('tenants.dialogs.suspendConfirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              variant="outline"
              size="sm"
              onClick={handleReactivate}
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              {t('tenants.bulk.reactivate')}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('tenants.bulk.delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('tenants.dialogs.deleteTenantsTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('tenants.dialogs.deleteTenantsDescription', { count: selectedTenants.length })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('tenants.dialogs.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive">
                    {t('tenants.bulk.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
