import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { 
  RefreshCw, 
  FileText,
  Tag,
  Mail,
} from 'lucide-react';

export function QuickActions() {
  const navigate = useNavigate();
  const { t } = useTranslation('superAdmin');

  const actions = [
    {
      label: t('quickActions.createPromoCode'),
      icon: Tag,
      onClick: () => navigate('/super-admin/promo-codes'),
      iconColor: 'text-purple-600',
    },
    {
      label: t('quickActions.newCampaign'),
      icon: Mail,
      onClick: () => navigate('/super-admin/campaigns/new'),
      iconColor: 'text-blue-600',
    },
    {
      label: t('quickActions.scheduleReminders'),
      icon: RefreshCw,
      onClick: () => navigate('/super-admin/reminders'),
      iconColor: 'text-green-600',
    },
    {
      label: t('quickActions.generateReport'),
      icon: FileText,
      onClick: () => navigate('/super-admin/analytics'),
      iconColor: 'text-orange-600',
    },
  ];

  return (
    <div className="border rounded-lg p-3">
      <h3 className="text-sm font-medium mb-3">{t('quickActions.title')}</h3>
      <div className="space-y-1">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="ghost"
            className="w-full justify-start h-9 text-sm"
            onClick={action.onClick}
          >
            <action.icon className={`h-4 w-4 mr-2 ${action.iconColor}`} />
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
