import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Settings2, Mail, Wrench, History } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/super-admin/shared/PageHeader';
import { BankPaymentSettings } from './BankPaymentSettings';
import { PlatformSettings } from './PlatformSettings';
import { EmailSettings } from './EmailSettings';
import { MaintenanceSettings } from './MaintenanceSettings';
import { AuditLogSettings } from './AuditLogSettings';

export function SuperAdminSettings() {
  const { t } = useTranslation('superAdmin');
  const [activeTab, setActiveTab] = useState('payment');

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.subtitle')}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 h-auto">
          <TabsTrigger value="payment" className="flex items-center gap-2 text-xs py-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settings.tabs.payment')}</span>
          </TabsTrigger>
          <TabsTrigger value="platform" className="flex items-center gap-2 text-xs py-2">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settings.tabs.platform')}</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2 text-xs py-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settings.tabs.email')}</span>
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="flex items-center gap-2 text-xs py-2">
            <Wrench className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settings.tabs.maintenance')}</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2 text-xs py-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settings.tabs.audit')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payment" className="mt-4">
          <BankPaymentSettings />
        </TabsContent>

        <TabsContent value="platform" className="mt-4">
          <PlatformSettings />
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <EmailSettings />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <MaintenanceSettings />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditLogSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
