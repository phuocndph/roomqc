// Selection toolbar — port từ Deal Hotel Hub, giữ nguyên UI
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Lock, Unlock, Copy, ClipboardPaste, RotateCcw, X, Check, MousePointerClick, Tag, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RowKind } from './useGridSelection'

export interface PriceApplyPayload {
  price?: number | null
  salePrice?: number | null
}

interface Props {
  count: number
  rowKind: RowKind | null
  rowLabel: string
  hasClipboard: boolean
  onApplyPrice: (payload: PriceApplyPayload) => void
  onApplyQty: (qty: number) => void
  onClose: () => void
  onOpen: () => void
  onReset?: () => void
  onCopy: () => void
  onPaste: () => void
  onClear: () => void
}

export function SelectionToolbar({
  count, rowKind, rowLabel, hasClipboard,
  onApplyPrice, onApplyQty, onClose, onOpen, onReset, onCopy, onPaste, onClear,
}: Props) {
  const [priceVal, setPriceVal] = useState('')
  const [saleVal, setSaleVal] = useState('')
  const [qtyVal, setQtyVal] = useState('')
  // Trạng thái compose của IME (bộ gõ tiếng Việt). Khi đang compose,
  // KHÔNG được format lại value (chèn dấu .) vì sẽ làm hỏng buffer của IME.
  const composingRef = useRef(false)

  useEffect(() => { setPriceVal(''); setSaleVal(''); setQtyVal('') }, [count, rowKind])

  const hasSelection = count > 0 && rowKind != null
  const isPrice = rowKind === 'price'

  const formatNum = (raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return ''
    return Number(digits).toLocaleString('vi-VN')
  }
  const parseNum = (formatted: string) => {
    const digits = formatted.replace(/\D/g, '')
    return digits === '' ? NaN : Number(digits)
  }

  // Handler chung cho 3 ô số: bỏ qua format khi đang IME-compose,
  // và format lại đúng 1 lần khi compositionend.
  const handleNumChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (composingRef.current) {
      // Giữ nguyên buffer thô để IME tiếp tục compose, không format
      setter(raw)
    } else {
      setter(formatNum(raw))
    }
  }
  const handleCompositionEnd = (setter: (v: string) => void) => (e: React.CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false
    setter(formatNum((e.target as HTMLInputElement).value))
  }
  const handleCompositionStart = () => { composingRef.current = true }

  const submitPrice = () => {
    if (!hasSelection) return
    const p = priceVal === '' ? undefined : parseNum(priceVal)
    const s = saleVal === '' ? undefined : parseNum(saleVal)
    if (p === undefined && s === undefined) return
    if (p !== undefined && (isNaN(p) || p < 0)) return
    if (s !== undefined && (isNaN(s) || s < 0)) return
    onApplyPrice({
      ...(p !== undefined ? { price: p } : {}),
      ...(s !== undefined ? { salePrice: s === 0 ? null : s } : {}),
    })
    setPriceVal(''); setSaleVal('')
  }

  const submitQty = () => {
    if (!hasSelection) return
    const n = Number(qtyVal)
    if (qtyVal === '' || isNaN(n) || n < 0) return
    onApplyQty(n)
    setQtyVal('')
  }

  const canSubmitPrice = hasSelection && (priceVal !== '' || saleVal !== '')
  const canSubmitQty = hasSelection && qtyVal !== ''

  return (
    <div
      data-selection-toolbar="1"
      className={cn(
        'sticky top-0 z-30 flex items-center gap-2 flex-wrap px-3 py-2 border-b shadow-sm backdrop-blur-sm transition-colors',
        hasSelection ? 'bg-primary/95 text-primary-foreground' : 'bg-muted/80 text-foreground',
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        {hasSelection ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Đã chọn <span className="tabular-nums">{count}</span> ngày
            <span className="opacity-70 font-normal hidden sm:inline">· {rowLabel}</span>
          </>
        ) : (
          <>
            <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground font-normal">Bôi đen các ô để chỉnh sửa nhanh</span>
          </>
        )}
      </div>

      <div className={cn('h-4 w-px mx-1 hidden sm:block', hasSelection ? 'bg-primary-foreground/30' : 'bg-border')} />

      {(!hasSelection || isPrice) ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1">
            <Tag className={cn('h-3 w-3', hasSelection ? 'text-primary-foreground/80' : 'text-muted-foreground')} />
            <Input
              type="text"
              inputMode="numeric"
              value={priceVal}
              onChange={handleNumChange(setPriceVal)}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd(setPriceVal)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !composingRef.current) { e.preventDefault(); submitPrice() } }}
              placeholder={hasSelection ? 'Giá gốc' : 'Bôi đen ô…'}
              disabled={!hasSelection}
              className={cn('h-7 w-28 text-xs tabular-nums', hasSelection ? 'bg-background text-foreground' : 'bg-background/60')}
            />
          </div>
          <div className="flex items-center gap-1">
            <Percent className={cn('h-3 w-3', hasSelection ? 'text-primary-foreground/80' : 'text-muted-foreground')} />
            <Input
              type="text"
              inputMode="numeric"
              value={saleVal}
              onChange={handleNumChange(setSaleVal)}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd(setSaleVal)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !composingRef.current) { e.preventDefault(); submitPrice() } }}
              placeholder={hasSelection ? 'Giá KM (0 = bỏ)' : ''}
              disabled={!hasSelection}
              className={cn('h-7 w-32 text-xs tabular-nums', hasSelection ? 'bg-background text-foreground' : 'bg-background/60')}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant={hasSelection ? 'secondary' : 'outline'}
            className="h-7 text-xs"
            onClick={submitPrice}
            disabled={!canSubmitPrice}
          >
            Áp dụng
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Input
            type="number" min={0}
            inputMode="numeric"
            value={qtyVal}
            onChange={(e) => setQtyVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitQty() } }}
            placeholder="Nhập SL phòng…"
            className="h-7 w-40 text-xs bg-background text-foreground"
          />
          <Button
            type="button"
            size="sm" variant="secondary" className="h-7 text-xs"
            onClick={submitQty} disabled={!canSubmitQty}
          >
            Áp dụng
          </Button>
        </div>
      )}

      <div className={cn('h-4 w-px mx-1 hidden sm:block', hasSelection ? 'bg-primary-foreground/30' : 'bg-border')} />

      <Button type="button" size="sm" variant="ghost"
        className={cn('h-7 text-xs', hasSelection ? 'text-primary-foreground hover:bg-primary-foreground/15' : '')}
        onClick={onClose} disabled={!hasSelection}
      >
        <Lock className="h-3 w-3 mr-1" /> Đóng bán
      </Button>
      <Button type="button" size="sm" variant="ghost"
        className={cn('h-7 text-xs', hasSelection ? 'text-primary-foreground hover:bg-primary-foreground/15' : '')}
        onClick={onOpen} disabled={!hasSelection}
      >
        <Unlock className="h-3 w-3 mr-1" /> Mở bán
      </Button>
      {isPrice && onReset && (
        <Button type="button" size="sm" variant="ghost"
          className="h-7 text-xs text-primary-foreground hover:bg-primary-foreground/15"
          onClick={onReset}
        >
          <RotateCcw className="h-3 w-3 mr-1" /> Reset
        </Button>
      )}

      <div className={cn('h-4 w-px mx-1 hidden sm:block', hasSelection ? 'bg-primary-foreground/30' : 'bg-border')} />

      <Button type="button" size="sm" variant="ghost"
        className={cn('h-7 text-xs', hasSelection ? 'text-primary-foreground hover:bg-primary-foreground/15' : '')}
        onClick={onCopy} disabled={!hasSelection}
      >
        <Copy className="h-3 w-3 mr-1" /> Copy <span className="opacity-70 ml-1">⌘C</span>
      </Button>
      <Button type="button" size="sm" variant="ghost"
        className={cn('h-7 text-xs', hasSelection ? 'text-primary-foreground hover:bg-primary-foreground/15' : '')}
        onClick={onPaste} disabled={!hasSelection || !hasClipboard}
      >
        <ClipboardPaste className="h-3 w-3 mr-1" /> Paste <span className="opacity-70 ml-1">⌘V</span>
      </Button>

      <div className="flex-1" />

      {hasSelection && (
        <Button type="button" size="icon" variant="ghost"
          className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/15"
          onClick={onClear} title="Bỏ chọn (Esc)"
         aria-label="Đóng">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
