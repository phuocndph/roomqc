import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';

interface EmailTemplatePreviewProps {
  template: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Escape HTML to prevent XSS
const escapeHtml = (str: string): string => {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

export function EmailTemplatePreview({
  template,
  open,
  onOpenChange,
}: EmailTemplatePreviewProps) {
  if (!template) return null;

  // Sanitize user-provided content
  const safeName = escapeHtml(template.name);
  const safePreview = escapeHtml(template.preview);

  const sampleHTML = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
        <h1 style="color: white; margin: 0;">${safeName}</h1>
      </div>
      <div style="padding: 40px; background: white;">
        <h2>Hi {{tenant_name}},</h2>
        <p style="line-height: 1.6; color: #333;">
          ${safePreview}
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="#" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Get Started
          </a>
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Best regards,<br>
          The {{platform_name}} Team
        </p>
      </div>
      <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #999;">
        <p>© 2024 Hotel SaaS Platform. All rights reserved.</p>
        <p>
          <a href="#" style="color: #667eea;">Unsubscribe</a> | 
          <a href="#" style="color: #667eea;">Update Preferences</a>
        </p>
      </div>
    </div>
  `;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{template.name} - Preview</DialogTitle>
            <Button variant="outline" size="sm">
              <Copy className="h-4 w-4 mr-2" />
              Use Template
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Subject Line */}
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Subject Line:</p>
            <p className="font-medium">{template.subject}</p>
          </div>

          {/* Email Preview */}
          <div className="border rounded-lg overflow-hidden">
            <div
              dangerouslySetInnerHTML={{ __html: sampleHTML }}
              className="bg-white"
            />
          </div>

          {/* Template Variables */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-2">
              Available Variables:
            </p>
            <div className="flex flex-wrap gap-2">
              {['{{tenant_name}}', '{{contact_name}}', '{{platform_name}}', '{{renewal_date}}', '{{days_left}}'].map((variable) => (
                <code key={variable} className="bg-white px-2 py-1 rounded text-xs border border-blue-200">
                  {variable}
                </code>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
