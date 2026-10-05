import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Send, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export function EmailSettings() {
  const { t } = useTranslation('superAdmin');
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // SMTP Config state
  const [smtpConfig, setSmtpConfig] = useState({
    host: '',
    port: '587',
    username: '',
    password: '',
    senderEmail: '',
    senderName: '',
  });

  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'smtp_config')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          try {
            const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            setSmtpConfig(prev => ({ ...prev, ...parsed }));
          } catch {
            // ignore parse errors
          }
        }
      });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('platform_settings')
        .upsert(
          {
            key: 'smtp_config',
            value: JSON.stringify(smtpConfig),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );
      if (error) throw error;
      toast.success('Đã lưu cấu hình SMTP');
    } catch (err: any) {
      toast.error('Lỗi lưu cấu hình: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmail) {
      toast.error('Vui lòng nhập email nhận test');
      return;
    }

    setIsSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke('send-notification-email', {
        body: {
          to: testEmail,
          subject: '[Test] Kiểm tra cấu hình email hệ thống',
          html: '<p>Email test từ RoomWeave Pro. Nếu bạn nhận được email này, cấu hình đã hoạt động.</p>',
        },
      });
      if (error) throw error;
      toast.success(`Đã gửi email test đến ${testEmail}`);
    } catch (err: any) {
      toast.error('Lỗi gửi email: ' + err.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* SMTP Configuration */}
      <div className="p-4 border rounded-lg space-y-4">
        <h3 className="font-medium text-sm">{t('settings.email.smtpConfig')}</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs">{t('settings.email.smtpHost')}</Label>
            <Input
              className="h-9"
              placeholder="smtp.gmail.com"
              value={smtpConfig.host}
              onChange={(e) => setSmtpConfig(prev => ({ ...prev, host: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('settings.email.smtpPort')}</Label>
            <Input
              className="h-9"
              placeholder="587"
              value={smtpConfig.port}
              onChange={(e) => setSmtpConfig(prev => ({ ...prev, port: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('settings.email.username')}</Label>
            <Input
              className="h-9"
              placeholder="your-email@gmail.com"
              value={smtpConfig.username}
              onChange={(e) => setSmtpConfig(prev => ({ ...prev, username: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('settings.email.password')}</Label>
            <Input
              className="h-9"
              type="password"
              placeholder="App password"
              value={smtpConfig.password}
              onChange={(e) => setSmtpConfig(prev => ({ ...prev, password: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* Sender Info */}
      <div className="p-4 border rounded-lg space-y-4">
        <h3 className="font-medium text-sm">{t('settings.email.senderInfo')}</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs">{t('settings.email.senderEmail')}</Label>
            <Input
              className="h-9"
              placeholder="noreply@example.com"
              value={smtpConfig.senderEmail}
              onChange={(e) => setSmtpConfig(prev => ({ ...prev, senderEmail: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('settings.email.senderName')}</Label>
            <Input
              className="h-9"
              placeholder="Hotel Asset Manager"
              value={smtpConfig.senderName}
              onChange={(e) => setSmtpConfig(prev => ({ ...prev, senderName: e.target.value }))}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Đang lưu...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Lưu cấu hình
            </>
          )}
        </Button>
      </div>

      {/* Test Email */}
      <div className="p-4 border rounded-lg space-y-4">
        <h3 className="font-medium text-sm">{t('settings.email.testEmail')}</h3>
        
        <div className="flex gap-2">
          <Input
            className="h-9 max-w-xs"
            placeholder="Email nhận test"
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleSendTestEmail}
            disabled={isSendingTest}
          >
            {isSendingTest ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Đang gửi...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {t('settings.email.sendTest')}
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Gửi email test để kiểm tra cấu hình SMTP hoạt động đúng
        </p>
      </div>
    </div>
  );
}
