import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { 
  ArrowLeft,
  ClipboardCheck,
  XCircle,
  AlertTriangle,
  Wrench,
  Calendar,
  Users,
  Save
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { TouchButton } from '@/components/mobile/TouchOptimized'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Card } from '@/components/ui/card'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { UserMultiSelect } from '@/components/shared/UserMultiSelect'
import { CategoryMultiSelect } from '@/components/shared/CategoryMultiSelect'
import { ItemMultiSelect } from '@/components/shared/ItemMultiSelect'
import { useCreateStockAdjustment } from '@/hooks/useStockAdjustments'
import { useItems } from '@/hooks/useItems'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'

const adjustmentSchema = z.object({
  adjustment_type: z.enum(['inventory_check', 'damage', 'loss', 'correction']),
  scheduled_date: z.date({
    required_error: 'Vui lòng chọn ngày',
  }),
  assigned_to: z.array(z.string().uuid()).min(1, 'Phải chọn ít nhất 1 người'),
  scope: z.enum(['all', 'by_category', 'specific_items']),
  categories: z.array(z.string().uuid()).optional(),
  item_ids: z.array(z.string().uuid()).optional(),
  notes: z.string().optional(),
}).refine(
  (data) => {
    if (data.scope === 'by_category') {
      return data.categories && data.categories.length > 0
    }
    if (data.scope === 'specific_items') {
      return data.item_ids && data.item_ids.length > 0
    }
    return true
  },
  {
    message: 'Vui lòng chọn danh mục hoặc items',
    path: ['categories'],
  }
)

type AdjustmentFormData = z.infer<typeof adjustmentSchema>

const adjustmentTypes = [
  { value: 'inventory_check', label: 'Kiểm kho', icon: ClipboardCheck, description: 'Kiểm kê định kỳ' },
  { value: 'damage', label: 'Hư hỏng', icon: XCircle, description: 'Ghi nhận hư hỏng' },
  { value: 'loss', label: 'Mất mát', icon: AlertTriangle, description: 'Ghi nhận thất thoát' },
  { value: 'correction', label: 'Hiệu chỉnh', icon: Wrench, description: 'Điều chỉnh số liệu' },
]

const scopes = [
  { value: 'all', label: 'Tất cả', description: 'Kiểm toàn bộ kho' },
  { value: 'by_category', label: 'Theo danh mục', description: 'Chọn danh mục' },
  { value: 'specific_items', label: 'Items cụ thể', description: 'Chọn từng item' },
]

export function MobileAdjustmentForm() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const totalSteps = 4
  
  const { mutate: createAdjustment, isPending: isLoading } = useCreateStockAdjustment()
  
  const form = useForm<AdjustmentFormData>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      adjustment_type: 'inventory_check',
      scheduled_date: new Date(),
      assigned_to: [],
      scope: 'all',
      categories: [],
      item_ids: [],
      notes: '',
    },
  })
  
  const adjustmentType = form.watch('adjustment_type')
  const scope = form.watch('scope')
  const scheduledDate = form.watch('scheduled_date')
  const assignedTo = form.watch('assigned_to')
  const selectedCategories = form.watch('categories')
  const selectedItems = form.watch('item_ids')
  
  // Get items based on scope
  const itemsFilters = 
    scope === 'all'
      ? {}
      : scope === 'by_category' && selectedCategories && selectedCategories.length > 0
      ? { categoryId: selectedCategories[0] }
      : scope === 'specific_items' && selectedItems && selectedItems.length > 0
      ? {}
      : undefined
  
  const { data: itemsData } = useItems(itemsFilters, 1, 1000)
  
  const displayItems = 
    scope === 'all'
      ? itemsData?.items || []
      : scope === 'by_category'
      ? itemsData?.items || []
      : scope === 'specific_items'
      ? (itemsData?.items || []).filter(item => selectedItems?.includes(item.id))
      : []
  
  const itemsCount = 
    scope === 'all' 
      ? itemsData?.total || 0
      : scope === 'specific_items'
      ? selectedItems?.length || 0
      : itemsData?.items.length || 0
  
  const canProceedStep1 = adjustmentType && scheduledDate
  const canProceedStep2 = assignedTo.length > 0
  const canProceedStep3 = 
    scope === 'all' || 
    (scope === 'by_category' && selectedCategories && selectedCategories.length > 0) ||
    (scope === 'specific_items' && selectedItems && selectedItems.length > 0)
  
  const handleSaveDraft = () => {
    toast.success('Đã lưu nháp')
    navigate('/inventory/adjustments')
  }
  
  const handleSubmit = form.handleSubmit((data) => {
    createAdjustment(data as any, {
      onSuccess: () => {
        toast.success('Tạo phiếu kiểm kê thành công')
        navigate('/inventory/adjustments')
      },
    })
  })
  
  const selectedType = adjustmentTypes.find(t => t.value === adjustmentType)
  
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Progress Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <TouchButton variant="ghost" size="icon" onClick={() => step === 1 ? navigateBack(navigate, '/inventory/adjustments') : setStep(step - 1)}>
              <ArrowLeft className="h-5 w-5" />
            </TouchButton>
            <span className="text-sm font-medium">Bước {step}/{totalSteps}</span>
            <TouchButton variant="ghost" onClick={handleSaveDraft} disabled={isLoading}>
              <Save className="h-4 w-4 mr-1" />
              Lưu nháp
            </TouchButton>
          </div>
          <Progress value={(step / totalSteps) * 100} className="h-2" />
        </div>
      </div>
      
      {/* Step Content */}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="p-4 space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold mb-1">Loại kiểm kê</h2>
              <p className="text-sm text-muted-foreground mb-4">Chọn loại phù hợp</p>
              
              <div className="grid grid-cols-2 gap-3">
                {adjustmentTypes.map((type) => {
                  const Icon = type.icon
                  const isSelected = adjustmentType === type.value
                  return (
                    <TouchButton
                      key={type.value}
                      variant={isSelected ? 'default' : 'outline'}
                      className="h-28 flex-col gap-2 justify-center"
                      onClick={() => form.setValue('adjustment_type', type.value as any)}
                    >
                      <Icon className="h-8 w-8" />
                      <div className="text-center">
                        <div className="text-sm font-medium">{type.label}</div>
                        <div className="text-xs opacity-70">{type.description}</div>
                      </div>
                    </TouchButton>
                  )
                })}
              </div>
            </div>
            
            <div>
              <h2 className="text-lg font-semibold mb-3">Ngày thực hiện</h2>
              
              <Popover>
                <PopoverTrigger asChild>
                  <TouchButton
                    variant="outline"
                    className={cn(
                      "w-full h-12 justify-start text-left font-normal",
                      !scheduledDate && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {scheduledDate ? (
                      format(scheduledDate, 'PPP', { locale: vi })
                    ) : (
                      <span>Chọn ngày</span>
                    )}
                  </TouchButton>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={scheduledDate}
                    onSelect={(date) => date && form.setValue('scheduled_date', date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </motion.div>
        )}
        
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="p-4 space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold mb-1">Phân công</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Chọn người thực hiện ({assignedTo.length} đã chọn)
              </p>
              
              <UserMultiSelect
                value={assignedTo}
                onChange={(users) => form.setValue('assigned_to', users)}
              />
              
              {form.formState.errors.assigned_to && (
                <p className="text-sm text-destructive mt-2">
                  {form.formState.errors.assigned_to.message}
                </p>
              )}
            </div>
          </motion.div>
        )}
        
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="p-4 space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold mb-1">Phạm vi kiểm kê</h2>
              <p className="text-sm text-muted-foreground mb-4">Chọn items cần kiểm</p>
              
              <div className="space-y-3 mb-4">
                {scopes.map((s) => {
                  const isSelected = scope === s.value
                  return (
                    <TouchButton
                      key={s.value}
                      variant={isSelected ? 'default' : 'outline'}
                      className="w-full h-16 justify-start"
                      onClick={() => form.setValue('scope', s.value as any)}
                    >
                      <div className="text-left">
                        <div className="font-medium">{s.label}</div>
                        <div className="text-xs opacity-70">{s.description}</div>
                      </div>
                    </TouchButton>
                  )
                })}
              </div>
              
              {scope === 'by_category' && (
                <div>
                  <Label className="mb-2 block">Chọn danh mục</Label>
                  <CategoryMultiSelect
                    value={selectedCategories || []}
                    onChange={(cats) => form.setValue('categories', cats)}
                  />
                </div>
              )}
              
              {scope === 'specific_items' && (
                <div>
                  <Label className="mb-2 block">Chọn items</Label>
                  <ItemMultiSelect
                    value={selectedItems || []}
                    onChange={(items) => form.setValue('item_ids', items)}
                  />
                </div>
              )}
              
              {itemsCount > 0 && (
                <Card className="p-4 bg-muted/50 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Số items sẽ kiểm:</span>
                    <span className="text-lg font-bold">{itemsCount}</span>
                  </div>
                </Card>
              )}
            </div>
          </motion.div>
        )}
        
        {step === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="p-4 space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold mb-4">Ghi chú</h2>
              
              <div>
                <Label htmlFor="notes">Thêm ghi chú (tùy chọn)</Label>
                <Textarea 
                  id="notes"
                  placeholder="Ghi chú về phiếu kiểm kê..."
                  rows={6}
                  className="resize-none mt-2"
                  {...form.register('notes')}
                />
              </div>
            </div>
            
            {/* Review Summary */}
            <div className="space-y-3 p-4 bg-muted rounded-lg">
              <h3 className="font-semibold">Xác nhận thông tin</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loại:</span>
                  <span className="font-medium">{selectedType?.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ngày thực hiện:</span>
                  <span className="font-medium">
                    {scheduledDate && format(scheduledDate, 'dd/MM/yyyy', { locale: vi })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Số người:</span>
                  <span className="font-medium">{assignedTo.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phạm vi:</span>
                  <span className="font-medium">
                    {scopes.find(s => s.value === scope)?.label}
                  </span>
                </div>
                <div className="h-px bg-border my-2" />
                <div className="flex justify-between text-lg">
                  <span className="font-semibold">Số items:</span>
                  <span className="font-bold text-primary">{itemsCount}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Navigation Footer */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t space-y-2">
        <div className="flex gap-2">
          {step > 1 && (
            <TouchButton variant="outline" onClick={() => setStep(step - 1)} className="flex-1">
              Quay lại
            </TouchButton>
          )}
          <TouchButton 
            onClick={step === totalSteps ? handleSubmit : () => setStep(step + 1)}
            className="flex-1"
            disabled={
              (step === 1 && !canProceedStep1) ||
              (step === 2 && !canProceedStep2) ||
              (step === 3 && !canProceedStep3) ||
              (step === 4 && isLoading)
            }
          >
            {step === totalSteps ? (isLoading ? 'Đang tạo...' : 'Hoàn thành') : 'Tiếp tục'}
          </TouchButton>
        </div>
      </div>
    </div>
  )
}
