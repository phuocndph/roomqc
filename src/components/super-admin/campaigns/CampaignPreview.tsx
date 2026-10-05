import { Card, CardContent } from '@/components/ui/card';

interface CampaignPreviewProps {
  subject: string;
  body: string;
}

export function CampaignPreview({ subject, body }: CampaignPreviewProps) {
  // Replace template variables with sample data
  const previewBody = body
    .replace(/\{\{tenant_name\}\}/g, 'Acme Hotels')
    .replace(/\{\{contact_name\}\}/g, 'John Doe')
    .replace(/\{\{plan_name\}\}/g, 'Premium Plan');

  return (
    <Card className="bg-card shadow-lg">
      <CardContent className="p-0">
        {/* Email Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
          <h2 className="text-xl font-bold">Your Hotel SaaS Platform</h2>
          <p className="text-sm opacity-90">Hotel Management Made Easy</p>
        </div>

        {/* Email Body */}
        <div className="p-6">
          {/* Subject */}
          <div className="mb-4 pb-4 border-b">
            <p className="text-xs text-muted-foreground mb-1">Subject:</p>
            <h3 className="text-lg font-semibold">
              {subject || 'Your Email Subject Here'}
            </h3>
          </div>

          {/* Body Content */}
          <div className="prose prose-sm max-w-none">
            {previewBody ? (
              <div className="whitespace-pre-wrap">{previewBody}</div>
            ) : (
              <p className="text-muted-foreground italic">
                Your email body will appear here...
              </p>
            )}
          </div>

          {/* CTA Button Example */}
          {body && (
            <div className="mt-6">
              <button className="bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors">
                Take Action
              </button>
            </div>
          )}
        </div>

        {/* Email Footer */}
        <div className="bg-muted p-6 text-center text-xs text-muted-foreground border-t">
          <p>© 2024 Hotel SaaS Platform. All rights reserved.</p>
          <p className="mt-1">
            <a href="#" className="text-purple-600 hover:underline">Unsubscribe</a>
            {' • '}
            <a href="#" className="text-purple-600 hover:underline">Update Preferences</a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
