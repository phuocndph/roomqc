import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface WorkflowBasicInfoForm {
  name: string
  description: string
}

interface WorkflowBasicInfoProps {
  form: WorkflowBasicInfoForm
  onChange: (updates: Partial<WorkflowBasicInfoForm>) => void
}

export const WorkflowBasicInfo = ({ form, onChange }: WorkflowBasicInfoProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Thông tin cơ bản</h3>
        <p className="text-sm text-muted-foreground">
          Đặt tên và mô tả rõ ràng cho workflow của bạn
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Tên workflow *</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="VD: Thông báo checkout phòng cho buồng phòng"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="description">Mô tả</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="VD: Tự động gửi thông báo Telegram khi có phòng checkout để buồng phòng chuẩn bị dọn dẹp"
            rows={3}
            className="mt-1.5"
          />
        </div>
      </div>
    </div>
  )
}
