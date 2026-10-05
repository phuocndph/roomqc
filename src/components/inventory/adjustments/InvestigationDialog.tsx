import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Search, 
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency, cn } from '@/lib/utils'
import { 
  VARIANCE_REASONS, 
  RESOLUTION_OPTIONS,
  type ResolutionType,
  type VarianceReasonCode,
} from '@/types/adjustment-investigation.types'
import { useStartInvestigation, useResolveInvestigation } from '@/hooks/useStockAdjustments'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'

interface InvestigationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: {
    id: string
    item_id: string
    system_quantity: number
    actual_quantity: number
    unit_price: number | null
    discrepancy_reason: string | null
    investigation_status: string | null
    investigation_notes: string | null
    item?: {
      name: string
      code: string
    }
  }
  adjustmentId: string
}

export function InvestigationDialog({
  open,
  onOpenChange,
  item,
  adjustmentId,
}: InvestigationDialogProps) {
  const { tenant } = useTenant()
  const [step, setStep] = useState<'start' | 'resolve'>(() => 
    item.investigation_status === 'investigating' ? 'resolve' : 'start'
  )
  const [notes, setNotes] = useState(item.investigation_notes || '')
  const [reasonCode, setReasonCode] = useState<VarianceReasonCode | ''>('')
  const [resolutionType, setResolutionType] = useState<ResolutionType | ''>('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [responsiblePersonId, setResponsiblePersonId] = useState<string>('')
  
  const { mutate: startInvestigation, isPending: isStarting } = useStartInvestigation()
  const { mutate: resolveInvestigation, isPending: isResolving } = useResolveInvestigation()
  
  // Fetch staff for compensation assignment
  const { data: staffList } = useQuery({
    queryKey: ['staff-list', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('tenant_id', tenant.id)
        .order('full_name')
      return data || []
    },
    enabled: !!tenant?.id && resolutionType === 'compensation',
  })
  
  const difference = item.actual_quantity - item.system_quantity
  const isShortage = difference < 0
  const isSurplus = difference > 0
  const valueDifference = Math.abs(difference) * (item.unit_price || 0)
  
  const resolutionOptions = isShortage 
    ? RESOLUTION_OPTIONS.shortage 
    : RESOLUTION_OPTIONS.surplus
  
  const handleStartInvestigation = () => {
    startInvestigation(
      { itemId: item.id, adjustmentId, notes },
      {
        onSuccess: () => {
          setStep('resolve')
        },
      }
    )
  }
  
  const handleResolve = () => {
    if (!resolutionType) return
    
    resolveInvestigation(
      { 
        itemId: item.id, 
        adjustmentId, 
        resolutionType: resolutionType as ResolutionType,
        resolutionNotes: `${reasonCode ? VARIANCE_REASONS[reasonCode as VarianceReasonCode]?.label + ': ' : ''}${resolutionNotes}`,
        responsiblePersonId: responsiblePersonId || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          // Reset form
          setStep('start')
          setNotes('')
          setReasonCode('')
          setResolutionType('')
          setResolutionNotes('')
          setResponsiblePersonId('')
        },
      }
    )
  }
  
  const handleClose = () => {
    onOpenChange(false)
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'start' ? (
              <>
                <Search className="h-5 w-5 text-amber-600" />
                Điều tra chênh lệch
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                Xử lý kết quả điều tra
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {item.item?.name} ({item.item?.code})
          </DialogDescription>
        </DialogHeader>
        
        {/* Item Summary */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Số hệ thống</span>
            <span className="font-medium">{item.system_quantity}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Số thực tế</span>
            <span className="font-medium">{item.actual_quantity}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Chênh lệch</span>
            <div className="flex items-center gap-2">
              {isShortage ? (
                <TrendingDown className="h-4 w-4 text-red-600" />
              ) : (
                <TrendingUp className="h-4 w-4 text-green-600" />
              )}
              <span className={cn(
                'font-bold text-lg',
                isShortage ? 'text-red-600' : 'text-green-600'
              )}>
                {difference > 0 ? '+' : ''}{difference}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Giá trị</span>
            <Badge variant={isShortage ? 'destructive' : 'default'}>
              {isShortage ? '-' : '+'}{formatCurrency(valueDifference)}
            </Badge>
          </div>
        </div>
        
        {step === 'start' ? (
          /* Step 1: Start Investigation */
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">
                    {isShortage ? 'Phát hiện THIẾU hàng' : 'Phát hiện THỪA hàng'}
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    Cần điều tra để xác định nguyên nhân trước khi quyết định cách xử lý.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Ghi chú điều tra</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Mô tả những gì cần điều tra, các thông tin ban đầu..."
                rows={3}
              />
            </div>
          </div>
        ) : (
          /* Step 2: Resolve Investigation */
          <div className="space-y-4">
            {/* Reason Selection */}
            <div className="space-y-2">
              <Label>Nguyên nhân *</Label>
              <Select value={reasonCode} onValueChange={(v) => setReasonCode(v as VarianceReasonCode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nguyên nhân" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(VARIANCE_REASONS).map(([code, info]) => (
                    <SelectItem key={code} value={code}>
                      <div className="flex flex-col">
                        <span>{info.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Resolution Type Selection */}
            <div className="space-y-2">
              <Label>Cách xử lý *</Label>
              <RadioGroup 
                value={resolutionType} 
                onValueChange={(v) => setResolutionType(v as ResolutionType)}
              >
                {resolutionOptions.map((option) => (
                  <div 
                    key={option.value}
                    className={cn(
                      'flex items-start space-x-3 rounded-lg border p-3 cursor-pointer transition-colors',
                      resolutionType === option.value 
                        ? 'border-primary bg-primary/5' 
                        : 'hover:bg-muted/50'
                    )}
                    onClick={() => setResolutionType(option.value as ResolutionType)}
                  >
                    <RadioGroupItem value={option.value} id={option.value} className="mt-0.5" />
                    <div className="space-y-0.5">
                      <Label htmlFor={option.value} className="font-medium cursor-pointer">
                        {option.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>
            
            {/* Responsible Person (for compensation) */}
            {resolutionType === 'compensation' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <UserRound className="h-4 w-4" />
                  Người chịu trách nhiệm
                </Label>
                <Select value={responsiblePersonId} onValueChange={setResponsiblePersonId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn người chịu trách nhiệm" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList?.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Resolution Notes */}
            <div className="space-y-2">
              <Label>Ghi chú xử lý</Label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Chi tiết kết quả điều tra, quyết định xử lý..."
                rows={2}
              />
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Hủy
          </Button>
          
          {step === 'start' ? (
            <Button onClick={handleStartInvestigation} disabled={isStarting}>
              {isStarting ? 'Đang xử lý...' : (
                <>
                  Bắt đầu điều tra
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          ) : (
            <Button 
              onClick={handleResolve} 
              disabled={isResolving || !reasonCode || !resolutionType}
            >
              {isResolving ? 'Đang xử lý...' : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Xác nhận xử lý
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
