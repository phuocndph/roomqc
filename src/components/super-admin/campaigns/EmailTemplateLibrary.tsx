import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Eye, Copy, Edit } from 'lucide-react';
import { EmailTemplatePreview } from './EmailTemplatePreview';

interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  preview: string;
  thumbnail: string;
}

const templates: EmailTemplate[] = [
  {
    id: '1',
    name: 'Welcome Email',
    category: 'Onboarding',
    subject: 'Welcome to {{platform_name}}! 🎉',
    preview: 'A warm welcome message for new tenants with getting started guide.',
    thumbnail: '/templates/welcome.png',
  },
  {
    id: '2',
    name: 'Trial Expiring',
    category: 'Renewal',
    subject: 'Your trial ends in {{days_left}} days',
    preview: 'Reminder for users whose trial is about to expire.',
    thumbnail: '/templates/trial-expiring.png',
  },
  {
    id: '3',
    name: 'Upgrade to Premium',
    category: 'Promotional',
    subject: 'Unlock Premium Features - Special Offer Inside',
    preview: 'Encourage users to upgrade with special discount.',
    thumbnail: '/templates/upgrade.png',
  },
  {
    id: '4',
    name: 'Feature Announcement',
    category: 'Educational',
    subject: 'New Feature: {{feature_name}} is here!',
    preview: 'Announce new features and how to use them.',
    thumbnail: '/templates/feature.png',
  },
  {
    id: '5',
    name: 'Renewal Reminder',
    category: 'Renewal',
    subject: 'Your subscription renews on {{renewal_date}}',
    preview: 'Friendly reminder about upcoming subscription renewal.',
    thumbnail: '/templates/renewal.png',
  },
  {
    id: '6',
    name: 'Payment Failed',
    category: 'Transactional',
    subject: 'Action Required: Payment Failed',
    preview: 'Alert users about failed payment with action steps.',
    thumbnail: '/templates/payment-failed.png',
  },
];

interface EmailTemplateLibraryProps {
  onSelectTemplate?: (template: EmailTemplate) => void;
}

export function EmailTemplateLibrary({ onSelectTemplate }: EmailTemplateLibraryProps = {}) {
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const categories = [...new Set(templates.map(t => t.category))];

  const handleUseTemplate = (template: EmailTemplate) => {
    onSelectTemplate?.(template);
  };

  return (
    <div className="space-y-6">
      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm">All Templates</Button>
        {categories.map((category) => (
          <Button key={category} variant="ghost" size="sm">
            {category}
          </Button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id} className="overflow-hidden hover:shadow-lg transition-shadow">
            <div className="h-40 bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center">
              <Mail className="h-16 w-16 text-purple-600 opacity-20" />
            </div>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <Badge variant="secondary" className="mt-2">
                    {template.category}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Subject:</p>
                  <p className="text-sm font-mono">{template.subject}</p>
                </div>
                <p className="text-sm text-muted-foreground">{template.preview}</p>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSelectedTemplate(template);
                      setPreviewOpen(true);
                    }}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleUseTemplate(template)}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Use Template
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Custom Template */}
      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Mail className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Create Custom Template</h3>
          <p className="text-muted-foreground text-center mb-4">
            Build your own email template from scratch
          </p>
          <Button>
            <Edit className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <EmailTemplatePreview
        template={selectedTemplate}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}
