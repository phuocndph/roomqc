import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface TemplatePreviewProps {
  template: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplatePreview({ template, open, onOpenChange }: TemplatePreviewProps) {
  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template.name} - Xem trước</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Tiêu đề:</p>
            <p className="text-sm font-medium">{template.subject}</p>
          </div>

          <div className="border rounded-lg p-4">
            <p className="text-sm whitespace-pre-wrap">{template.content}</p>
          </div>

          <div className="border rounded-lg p-3">
            <p className="text-xs font-medium mb-2">Biến có sẵn:</p>
            <div className="flex flex-wrap gap-1">
              {(template.variables || []).map((v: string) => (
                <Badge key={v} variant="outline" className="text-xs px-1.5 py-0">
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
