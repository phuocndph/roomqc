import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Save, AlertTriangle, Megaphone } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { usePlatformSettings, useUpdatePlatformSetting } from '@/hooks/super-admin/usePlatformSettings';
import { toast } from 'sonner';

export function MaintenanceSettings() {
  const { t } = useTranslation('superAdmin');
  const { data: settings, isLoading } = usePlatformSettings();
  const updateMutation = useUpdatePlatformSetting();

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [systemAnnouncement, setSystemAnnouncement] = useState('');

  useEffect(() => {
    if (settings) {
      setMaintenanceMode(settings.maintenance_mode || false);
      setMaintenanceMessage(settings.maintenance_message || '');
      setSystemAnnouncement(settings.system_announcement || '');
    }
  }, [settings]);

  const handleMaintenanceModeToggle = async (checked: boolean) => {
    setMaintenanceMode(checked);
    await updateMutation.mutateAsync({ key: 'maintenance_mode', value: checked });
  };

  const handleSaveMaintenanceMessage = async () => {
    await updateMutation.mutateAsync({ key: 'maintenance_message', value: maintenanceMessage });
  };

  const handleSaveAnnouncement = async () => {
    await updateMutation.mutateAsync({ key: 'system_announcement', value: systemAnnouncement });
  };

  const handleClearAnnouncement = async () => {
    setSystemAnnouncement('');
    await updateMutation.mutateAsync({ key: 'system_announcement', value: '' });
    toast.success('Đã xóa thông báo hệ thống');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Maintenance Mode */}
      <div className="p-4 border rounded-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${maintenanceMode ? 'bg-amber-100 text-amber-600' : 'bg-muted'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium text-sm">{t('settings.maintenance.maintenanceMode')}</h3>
              <p className="text-xs text-muted-foreground">
                {t('settings.maintenance.maintenanceModeDesc')}
              </p>
            </div>
          </div>
          <Switch
            checked={maintenanceMode}
            onCheckedChange={handleMaintenanceModeToggle}
            disabled={updateMutation.isPending}
          />
        </div>

        {maintenanceMode && (
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-xs">{t('settings.maintenance.maintenanceMessage')}</Label>
            <Textarea
              placeholder="Hệ thống đang được bảo trì. Vui lòng quay lại sau..."
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              className="min-h-[100px]"
            />
            <Button
              size="sm"
              onClick={handleSaveMaintenanceMessage}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Lưu thông báo
            </Button>
          </div>
        )}
      </div>

      {/* System Announcement */}
      <div className="p-4 border rounded-lg space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-medium text-sm">{t('settings.maintenance.systemAnnouncement')}</h3>
            <p className="text-xs text-muted-foreground">
              Thông báo này sẽ hiển thị cho tất cả người dùng khi đăng nhập
            </p>
          </div>
        </div>

        <Textarea
          placeholder="Nhập thông báo hiển thị cho tất cả người dùng..."
          value={systemAnnouncement}
          onChange={(e) => setSystemAnnouncement(e.target.value)}
          className="min-h-[100px]"
        />

        <div className="flex gap-2">
          <Button
            onClick={handleSaveAnnouncement}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Megaphone className="h-4 w-4 mr-2" />
            )}
            {t('settings.maintenance.sendAnnouncement')}
          </Button>

          {systemAnnouncement && (
            <Button
              variant="outline"
              onClick={handleClearAnnouncement}
              disabled={updateMutation.isPending}
            >
              Xóa thông báo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
