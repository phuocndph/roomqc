import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Eye, Edit, Trash2, Loader2 } from 'lucide-react';
import { TemplateEditor } from './TemplateEditor';
import { TemplatePreview } from './TemplatePreview';
import {
  useReminderTemplates,
  useDeleteReminderTemplate,
} from '@/hooks/super-admin/useRenewalReminders';

export function ReminderTemplates() {
  const { data: templates = [], isLoading } = useReminderTemplates();
  const deleteTemplate = useDeleteReminderTemplate();
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const categories = [...new Set(templates.map((t: any) => t.category))];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderList = (list: any[]) => (
    <div className="grid gap-3 md:grid-cols-2">
      {list.map((template: any) => (
        <div key={template.id} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium">{template.name}</p>
              <span className="text-xs text-muted-foreground capitalize">{template.category}</span>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Tiêu đề:</p>
            <p className="text-xs font-mono bg-muted p-1.5 rounded">{template.subject}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Biến:</p>
            <div className="flex flex-wrap gap-1">
              {(template.variables as string[] || []).slice(0, 3).map((v: string) => (
                <Badge key={v} variant="outline" className="text-xs px-1.5 py-0">
                  {`{{${v}}}`}
                </Badge>
              ))}
              {(template.variables as string[] || []).length > 3 && (
                <span className="text-xs text-muted-foreground">+{(template.variables as string[]).length - 3}</span>
              )}
            </div>
          </div>

          <div className="flex gap-1.5 pt-2 border-t">
            <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => { setSelectedTemplate(template); setPreviewOpen(true); }}>
              <Eye className="h-3 w-3 mr-1" /> Xem
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => { setSelectedTemplate(template); setEditorOpen(true); }}>
              <Edit className="h-3 w-3 mr-1" /> Sửa
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => deleteTemplate.mutate(template.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Cập nhật: {new Date(template.updated_at).toLocaleDateString('vi-VN')}
          </p>
        </div>
      ))}
      {list.length === 0 && (
        <div className="col-span-2 text-center py-8 text-sm text-muted-foreground">
          Chưa có mẫu nào
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Mẫu email</h3>
          <p className="text-xs text-muted-foreground">Quản lý mẫu email nhắc nhở gia hạn</p>
        </div>
        <Button size="sm" className="h-8" onClick={() => { setSelectedTemplate(null); setEditorOpen(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Tạo mẫu
        </Button>
      </div>

      <Tabs defaultValue="all" className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="all" className="text-xs">Tất cả</TabsTrigger>
          {categories.map((cat) => (
            <TabsTrigger key={cat} value={cat} className="text-xs capitalize">{cat}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all">{renderList(templates)}</TabsContent>
        {categories.map((cat) => (
          <TabsContent key={cat} value={cat}>
            {renderList(templates.filter((t: any) => t.category === cat))}
          </TabsContent>
        ))}
      </Tabs>

      <TemplateEditor template={selectedTemplate} open={editorOpen} onOpenChange={setEditorOpen} />
      <TemplatePreview template={selectedTemplate} open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}
