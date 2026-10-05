import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useSaveReminderTemplate } from '@/hooks/super-admin/useRenewalReminders';

interface TemplateEditorProps {
  template: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateEditor({ template, open, onOpenChange }: TemplateEditorProps) {
  const save = useSaveReminderTemplate();
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { name: '', subject: '', category: 'renewal', content: '', variables: '' },
  });

  useEffect(() => {
    if (open) {
      if (template) {
        reset({
          name: template.name,
          subject: template.subject,
          category: template.category,
          content: template.content,
          variables: (template.variables || []).join(', '),
        });
      } else {
        reset({ name: '', subject: '', category: 'renewal', content: '', variables: '' });
      }
    }
  }, [open, template, reset]);

  const onSubmit = (data: any) => {
    save.mutate({
      id: template?.id,
      name: data.name,
      subject: data.subject,
      category: data.category,
      content: data.content,
      variables: data.variables.split(',').map((v: string) => v.trim()).filter(Boolean),
    }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Sửa mẫu' : 'Tạo mẫu mới'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label className="text-xs">Tên mẫu</Label>
            <Input {...register('name')} placeholder="VD: 7 ngày trước hạn" className="h-8" />
          </div>
          <div>
            <Label className="text-xs">Danh mục</Label>
            <Input {...register('category')} placeholder="renewal" className="h-8" />
          </div>
          <div>
            <Label className="text-xs">Tiêu đề email</Label>
            <Input {...register('subject')} placeholder="Dùng {{biến}} cho nội dung động" className="h-8" />
          </div>
          <div>
            <Label className="text-xs">Nội dung</Label>
            <Textarea {...register('content')} rows={10} placeholder="Nội dung email..." className="font-mono text-xs" />
          </div>
          <div>
            <Label className="text-xs">Biến (phân cách bằng dấu phẩy)</Label>
            <Input {...register('variables')} placeholder="tenant_name, contact_name, expiry_date" className="h-8 font-mono text-xs" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              {template ? 'Cập nhật' : 'Tạo mới'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
