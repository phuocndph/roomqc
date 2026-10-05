import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, 
  Check,
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { navigateBack } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ImageUpload } from '@/components/shared/ImageUpload'
import { CompletionSummaryDialog } from '@/components/inventory/adjustments/CompletionSummaryDialog'
import { QuantityStatusBadge } from '@/components/inventory/adjustments/QuantityStatusBadge'
import { 
  useStockAdjustment, 
  useCheckAdjustmentItem,
  useUpdateAdjustmentStatus,
  useApproveAdjustment,
} from '@/hooks/useStockAdjustments'
import { useUser } from '@/hooks/useUser'
import { isAdminUser, isManager } from '@/lib/userAccess'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'

const AUTO_SAVE_DELAY = 2000 // 2 seconds

export function CheckAdjustmentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  
  const [currentIndex, setCurrentIndex] = useState(0)
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [showCompletionDialog, setShowCompletionDialog] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  
  const { data, isLoading, refetch } = useStockAdjustment(id)
  const { mutate: checkItem, isPending: isCheckingItem } = useCheckAdjustmentItem()
  const { mutate: updateStatus, isPending: isUpdatingStatus } = useUpdateAdjustmentStatus()
  const { mutate: approveAdjustment } = useApproveAdjustment()
  const { user } = useUser()
  
  const adjustment = data?.adjustment
  const items = useMemo(() => data?.items ?? [], [data?.items])
  const currentItem = items[currentIndex]
  
  const canApprove = isAdminUser(user as any) || isManager(user as any)
  const isCompleted = adjustment?.status === 'completed'
  const isApproved = adjustment?.status === 'approved'
  
  // Staff chỉ được kiểm tra phiếu được gán, Manager/Owner được kiểm tra tất cả
  const isAssignedToMe = adjustment?.assigned_to?.includes(user?.id)
  const canCheck = isAssignedToMe || isAdminUser(user as any)
  
  // Redirect nếu không có quyền check
  useEffect(() => {
    if (adjustment && !isLoading && !canCheck) {
      toast({
        title: 'Không có quyền truy cập',
        description: 'Bạn không được gán kiểm tra phiếu này',
        variant: 'destructive',
      })
      navigate(`/inventory/adjustments/${id}`)
    }
  }, [adjustment, isLoading, canCheck, id, navigate, toast])
  
  // Auto-save debounce refs
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const lastSavedDataRef = useRef<string>('')
  
  // LocalStorage backup key
  const localStorageKey = `adjustment-check-${id}`
  
  // Load saved data from localStorage on mount
  useEffect(() => {
    if (!id) return
    try {
      const saved = localStorage.getItem(localStorageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        setFormData(parsed)
        toast({
          title: 'Đã khôi phục dữ liệu',
          description: 'Dữ liệu chưa lưu từ phiên trước đã được khôi phục',
          duration: 3000,
        })
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, [id, localStorageKey, toast])
  
  // Save to localStorage whenever formData changes
  useEffect(() => {
    if (!id || Object.keys(formData).length === 0) return
    try {
      localStorage.setItem(localStorageKey, JSON.stringify(formData))
    } catch (e) {
      // Ignore storage errors
    }
  }, [formData, id, localStorageKey])
  
  // Clear localStorage when adjustment is completed
  useEffect(() => {
    if (isCompleted && id) {
      localStorage.removeItem(localStorageKey)
    }
  }, [isCompleted, id, localStorageKey])
  
  // Auto-save function
  const performAutoSave = useCallback((itemId: string, itemData: any) => {
    if (!adjustment || isCompleted || isApproved) return
    
    const actualQuantity = itemData.actual_quantity
    if (actualQuantity === undefined) return
    
    const currentItemData = items.find((i: any) => i.id === itemId)
    if (!currentItemData) return
    
    setAutoSaveStatus('saving')
    
    checkItem(
      {
        adjustmentId: adjustment.id,
        itemData: {
          item_id: currentItemData.item_id,
          actual_quantity: actualQuantity,
          discrepancy_reason: itemData.discrepancy_reason || null,
          photos: itemData.photos || null,
        },
      },
      {
        onSuccess: () => {
          setAutoSaveStatus('saved')
          setTimeout(() => setAutoSaveStatus('idle'), 2000)
        },
        onError: () => {
          setAutoSaveStatus('idle')
        },
      }
    )
  }, [adjustment, items, checkItem, isCompleted, isApproved])

  const handleSubmitItem = useCallback(() => {
    if (!adjustment || !currentItem || isCompleted || isApproved) return

    const data = formData[currentItem.id] || {}
    const actualQuantity = data.actual_quantity ?? currentItem.system_quantity

    checkItem(
      {
        adjustmentId: adjustment.id,
        itemData: {
          item_id: currentItem.item_id,
          actual_quantity: actualQuantity,
          discrepancy_reason: data.discrepancy_reason,
          photos: data.photos,
        },
      },
      {
        onSuccess: () => {
          lastSavedDataRef.current = JSON.stringify(formData[currentItem.id] || {})

          if (currentIndex < items.length - 1) {
            setCurrentIndex(currentIndex + 1)
          }
        },
      }
    )
  }, [adjustment, currentItem, isCompleted, isApproved, formData, checkItem, currentIndex, items.length])
  
  // Auto-save effect with debounce
  useEffect(() => {
    if (!currentItem || isCompleted || isApproved) return
    
    const currentData = formData[currentItem.id]
    if (!currentData) return
    
    const dataString = JSON.stringify(currentData)
    
    // Skip if data hasn't changed
    if (dataString === lastSavedDataRef.current) return
    
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }
    
    // Set new timeout for auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      lastSavedDataRef.current = dataString
      performAutoSave(currentItem.id, currentData)
    }, AUTO_SAVE_DELAY)
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [formData, currentItem, performAutoSave, isCompleted, isApproved])
  
  // Start checking if status is draft
  useEffect(() => {
    if (adjustment && adjustment.status === 'draft') {
      updateStatus({ adjustmentId: adjustment.id, status: 'in_progress' })
    }
  }, [adjustment, updateStatus])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (isCompleted || isApproved) return
      
      // Enter key to submit item
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        const activeElement = document.activeElement
        if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA' || activeElement?.tagName === 'SELECT') {
          return
        }
        e.preventDefault()
        handleSubmitItem()
      }
      
      // Ctrl+N for next item
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        if (currentIndex < items.length - 1) {
          setCurrentIndex(currentIndex + 1)
        }
      }
      
      // Ctrl+P for previous item
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault()
        if (currentIndex > 0) {
          setCurrentIndex(currentIndex - 1)
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentIndex, isCompleted, isApproved, items.length, formData, handleSubmitItem])
  
  if (isLoading || !adjustment || !currentItem) {
    return <div>Loading...</div>
  }
  
  const checkedCount = items.filter((i: any) => i.checked_at !== null).length
  const progress = (checkedCount / items.length) * 100
  
  const handleSkip = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }
  
  const handleShowCompletionDialog = () => {
    // Refetch to get latest data before showing summary
    refetch().then(() => {
      setShowCompletionDialog(true)
    })
  }
  
  const handleComplete = () => {
    updateStatus(
      { adjustmentId: adjustment.id, status: 'completed' },
      {
        onSuccess: () => {
          setShowCompletionDialog(false)
          // Clear localStorage on successful completion
          localStorage.removeItem(localStorageKey)
          navigate(`/inventory/adjustments/${adjustment.id}`)
        },
      }
    )
  }
  
  const handleApprove = () => {
    approveAdjustment(
      { adjustmentId: adjustment.id },
      {
        onSuccess: () => {
          navigate('/inventory/adjustments')
        },
      }
    )
  }
  
  const currentData = formData[currentItem.id] || {}
  const actualQuantity = currentData.actual_quantity ?? currentItem.system_quantity
  const discrepancy = actualQuantity - currentItem.system_quantity
  const hasDiscrepancy = discrepancy !== 0
  
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Kiểm kê - ${adjustment.adjustment_code}`}
        description={`Bắt đầu: ${adjustment.started_at ? format(new Date(adjustment.started_at), 'dd/MM/yyyy HH:mm', { locale: vi }) : 'Chưa bắt đầu'}`}
      >
        <div className="flex items-center gap-2">
          {/* Auto-save status indicator */}
          {autoSaveStatus === 'saving' && (
            <Badge variant="outline" className="text-muted-foreground">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Đang lưu...
            </Badge>
          )}
          {autoSaveStatus === 'saved' && (
            <Badge variant="outline" className="text-green-600 border-green-200">
              <Save className="h-3 w-3 mr-1" />
              Đã lưu
            </Badge>
          )}
          
          <Button variant="outline" onClick={() => navigateBack(navigate, `/inventory/adjustments/${id}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại
          </Button>
        </div>
      </PageHeader>
      
      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Tiến độ: {checkedCount}/{items.length} items
              </span>
              <Badge>{Math.round(progress)}%</Badge>
            </div>
            <Progress value={progress} />
          </div>
        </CardContent>
      </Card>
      
      {/* Checking Interface */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Item {currentIndex + 1}/{items.length}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentIndex(Math.min(items.length - 1, currentIndex + 1))}
                disabled={currentIndex === items.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Item Info */}
          <div className="flex items-start gap-4">
            {currentItem.item?.item_images?.[0]?.url && (
              <img
                src={currentItem.item.item_images[0].url}
                alt={currentItem.item.name}
                className="h-24 w-24 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <h3 className="text-xl font-bold">{currentItem.item?.name}</h3>
              <p className="text-sm text-muted-foreground">{currentItem.item?.code}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {currentItem.item?.category && (
                  <Badge variant="outline">
                    {currentItem.item.category.name}
                  </Badge>
                )}
                {currentItem.checked_at && (
                  <Badge variant="secondary">
                    Đã kiểm tra
                  </Badge>
                )}
                {currentItem.status === 'approved' && (
                  <Badge className="bg-green-500">
                    Đã duyệt
                  </Badge>
                )}
                {currentItem.status === 'rejected' && (
                  <Badge variant="destructive">
                    Từ chối
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          {/* Quantities with Status Badge */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Hệ thống</p>
              <p className="text-3xl font-bold">{currentItem.system_quantity}</p>
            </div>
            
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Thực tế *</label>
                {/* Status Badge */}
                <QuantityStatusBadge 
                  systemQuantity={currentItem.system_quantity}
                  actualQuantity={actualQuantity}
                  size="sm"
                />
              </div>
              <Input
                type="number" min={0}
                value={actualQuantity}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    [currentItem.id]: {
                      ...currentData,
                      actual_quantity: parseInt(e.target.value) || 0,
                    },
                  })
                }}
                className="mt-1 text-2xl font-bold"
                autoFocus
              />
            </div>
          </div>
          
          {/* Discrepancy Display */}
          {hasDiscrepancy && (
            <div className={cn(
              'rounded-lg border p-4',
              discrepancy > 0 ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800' : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
            )}>
              <p className="text-sm text-muted-foreground">Chênh lệch</p>
              <p className={cn(
                'text-3xl font-bold',
                discrepancy > 0 ? 'text-blue-600' : 'text-red-600'
              )}>
                {discrepancy > 0 ? '+' : ''}{discrepancy}
              </p>
            </div>
          )}
          
          {/* Condition */}
          <div>
            <label className="text-sm font-medium">Tình trạng vật lý</label>
            <Select
              value={currentData.condition || 'good'}
              onValueChange={(value) => {
                setFormData({
                  ...formData,
                  [currentItem.id]: {
                    ...currentData,
                    condition: value,
                  },
                })
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good">✓ Tốt</SelectItem>
                <SelectItem value="damaged">❌ Hư hỏng</SelectItem>
                <SelectItem value="lost">🚫 Mất</SelectItem>
                <SelectItem value="other">Khác</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Reason (if discrepancy) */}
          {hasDiscrepancy && (
            <div>
              <label className="text-sm font-medium">Lý do chênh lệch *</label>
              <Textarea
                value={currentData.discrepancy_reason || ''}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    [currentItem.id]: {
                      ...currentData,
                      discrepancy_reason: e.target.value,
                    },
                  })
                }}
                placeholder="Giải thích nguyên nhân chênh lệch..."
                rows={3}
                className="mt-1"
              />
            </div>
          )}
          
          {/* Photos */}
          <div>
            <label className="text-sm font-medium">
              Chụp ảnh {hasDiscrepancy && '(bắt buộc nếu có chênh lệch)'}
            </label>
            <ImageUpload
              images={currentData.photos || []}
              onChange={(photos) => {
                setFormData({
                  ...formData,
                  [currentItem.id]: {
                    ...currentData,
                    photos,
                  },
                })
              }}
              maxImages={5}
            />
          </div>
          
          {/* Actions */}
          {!isApproved && !isCompleted && (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={handleSubmitItem}
                disabled={hasDiscrepancy && !currentData.discrepancy_reason || isCheckingItem}
              >
                {isCheckingItem ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Xác nhận
              </Button>
              <Button
                variant="outline"
                onClick={handleSkip}
              >
                Bỏ qua
              </Button>
            </div>
          )}
          
          {/* Complete Button - Shows dialog first */}
          {!isCompleted && !isApproved && checkedCount === items.length && (
            <Button
              className="w-full"
              size="lg"
              onClick={handleShowCompletionDialog}
            >
              Hoàn thành kiểm kê
            </Button>
          )}
          
          {/* Approve Button */}
          {isCompleted && !isApproved && canApprove && (
            <div className="space-y-2">
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 p-4 border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Phiếu kiểm kê đã hoàn thành. Vui lòng xem xét và duyệt phiếu.
                </p>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={handleApprove}
              >
                <Check className="mr-2 h-4 w-4" />
                Duyệt phiếu kiểm kê
              </Button>
            </div>
          )}
          
          {/* Approved Status */}
          {isApproved && (
            <div className="rounded-lg bg-green-50 dark:bg-green-950 p-4 border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-800 dark:text-green-200 text-center">
                ✓ Phiếu kiểm kê đã được duyệt
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Keyboard Shortcuts Help */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            <kbd className="px-2 py-1 bg-muted rounded">Enter</kbd> Xác nhận • 
            <kbd className="px-2 py-1 bg-muted rounded ml-2">Tab</kbd> Next field • 
            <kbd className="px-2 py-1 bg-muted rounded ml-2">Ctrl+P</kbd> Previous • 
            <kbd className="px-2 py-1 bg-muted rounded ml-2">Ctrl+N</kbd> Next
            <span className="ml-4 text-xs">| Tự động lưu sau 2 giây</span>
          </p>
        </CardContent>
      </Card>
      
      {/* Completion Summary Dialog */}
      <CompletionSummaryDialog
        open={showCompletionDialog}
        onOpenChange={setShowCompletionDialog}
        items={items}
        onConfirm={handleComplete}
        isLoading={isUpdatingStatus}
      />
    </div>
  )
}
