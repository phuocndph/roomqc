import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, ArrowRight, AlertTriangle, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useRoomStandards } from '@/hooks/useRoomStandards'
import type { RoomType } from '@/types/rooms.types'
import { cn } from '@/lib/utils'

const ROOM_TYPE_KEYS: RoomType[] = ['standard', 'deluxe', 'suite', 'vip']

interface CloneStandardsDialogProps {
  currentRoomType: RoomType
  currentStandardsCount: number
  onClone: (sourceRoomType: RoomType) => Promise<void>
}

export function CloneStandardsDialog({
  currentRoomType,
  currentStandardsCount,
  onClone,
}: CloneStandardsDialogProps) {
  const { t } = useTranslation('rooms')
  const [open, setOpen] = useState(false)
  const [sourceRoomType, setSourceRoomType] = useState<RoomType | null>(null)
  const [step, setStep] = useState<'select' | 'preview' | 'done'>('select')
  const [isCloning, setIsCloning] = useState(false)

  const { data: sourceStandards, isLoading: isLoadingSource } = useRoomStandards(
    sourceRoomType || 'standard'
  )

  // Available source room types (exclude current)
  const availableSources = ROOM_TYPE_KEYS.filter((type) => type !== currentRoomType)

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('select')
        setSourceRoomType(null)
      }, 200)
    }
  }, [open])

  const handleSelectSource = (value: RoomType) => {
    setSourceRoomType(value)
  }

  const handleProceedToPreview = () => {
    if (sourceRoomType) {
      setStep('preview')
    }
  }

  const handleClone = async () => {
    if (!sourceRoomType) return

    setIsCloning(true)
    try {
      await onClone(sourceRoomType)
      setStep('done')
      setTimeout(() => {
        setOpen(false)
      }, 1500)
    } catch (error) {
      // Error handled by parent
    } finally {
      setIsCloning(false)
    }
  }

  const handleBack = () => {
    setStep('select')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Copy className="h-4 w-4" />
          {t('standards.clone.button', 'Sao chép từ...')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            {t('standards.clone.title', 'Nhân bản danh sách chuẩn')}
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && t('standards.clone.selectDescription', 'Chọn hạng phòng nguồn để sao chép danh sách tài sản')}
            {step === 'preview' && t('standards.clone.previewDescription', 'Xem trước danh sách sẽ được sao chép')}
            {step === 'done' && t('standards.clone.doneDescription', 'Đã sao chép thành công!')}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{t('standards.clone.from', 'Từ')}</p>
                <Select value={sourceRoomType || ''} onValueChange={(v) => handleSelectSource(v as RoomType)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={t('standards.clone.selectSource', 'Chọn hạng phòng...')} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSources.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`roomTypes.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{t('standards.clone.to', 'Đến')}</p>
                <div className="mt-1 px-3 py-2 bg-background border rounded-md font-medium">
                  {t(`roomTypes.${currentRoomType}`)}
                </div>
              </div>
            </div>

            {currentStandardsCount > 0 && (
              <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <p className="text-sm text-warning">
                  {t('standards.clone.warning', 'Danh sách hiện tại có {{count}} tài sản sẽ bị thay thế hoàn toàn.', {
                    count: currentStandardsCount,
                  })}
                </p>
              </div>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">
                {t(`roomTypes.${sourceRoomType}`)} → {t(`roomTypes.${currentRoomType}`)}
              </span>
              <Badge variant="secondary">
                {sourceStandards?.length || 0} {t('standards.clone.items', 'tài sản')}
              </Badge>
            </div>

            <ScrollArea className="h-[200px] border rounded-lg">
              {isLoadingSource ? (
                <div className="p-4 text-center text-muted-foreground">
                  {t('standards.loading', 'Đang tải...')}
                </div>
              ) : sourceStandards && sourceStandards.length > 0 ? (
                <div className="divide-y">
                  {sourceStandards.map((standard: any) => (
                    <div key={standard.id} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <p className="font-medium text-sm">{standard.item_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{standard.item_code}</p>
                      </div>
                      <Badge variant="outline">x{standard.quantity}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  {t('standards.clone.noItems', 'Không có tài sản nào')}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {step === 'done' && (
          <div className="py-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-4">
              <Check className="h-8 w-8" />
            </div>
            <p className="text-lg font-medium">
              {t('standards.clone.success', 'Sao chép thành công!')}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t('standards.clone.successDetail', 'Đã sao chép {{count}} tài sản', {
                count: sourceStandards?.length || 0,
              })}
            </p>
          </div>
        )}

        {step !== 'done' && (
          <DialogFooter className="gap-2 sm:gap-0">
            {step === 'preview' && (
              <Button variant="ghost" onClick={handleBack}>
                {t('common.back', 'Quay lại')}
              </Button>
            )}
            {step === 'select' && (
              <Button
                onClick={handleProceedToPreview}
                disabled={!sourceRoomType}
              >
                {t('standards.clone.preview', 'Xem trước')}
              </Button>
            )}
            {step === 'preview' && (
              <Button
                onClick={handleClone}
                disabled={isCloning || !sourceStandards?.length}
                className="gap-2"
              >
                {isCloning ? (
                  <>{t('standards.clone.cloning', 'Đang sao chép...')}</>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    {t('standards.clone.confirm', 'Xác nhận sao chép')}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
