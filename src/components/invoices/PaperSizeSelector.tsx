import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type PaperSize = 'A4' | 'A5' | 'K80' | 'K58'

export const PAPER_SIZES: { value: PaperSize; label: string; desc: string }[] = [
  { value: 'A4', label: 'A4', desc: '210×297mm' },
  { value: 'A5', label: 'A5', desc: '148×210mm' },
  { value: 'K80', label: 'K80', desc: '80mm receipt' },
  { value: 'K58', label: 'K58', desc: '58mm receipt' },
]

export const PAPER_CONFIG: Record<PaperSize, { width: number; padding: string; fontSize: number; isReceipt: boolean; pdfWidth: number; pdfHeight: number }> = {
  A4: { width: 794, padding: '40px 50px', fontSize: 13, isReceipt: false, pdfWidth: 210, pdfHeight: 297 },
  A5: { width: 560, padding: '30px 35px', fontSize: 11, isReceipt: false, pdfWidth: 148, pdfHeight: 210 },
  K80: { width: 302, padding: '8px', fontSize: 10, isReceipt: true, pdfWidth: 80, pdfHeight: 297 },
  K58: { width: 218, padding: '6px', fontSize: 9, isReceipt: true, pdfWidth: 58, pdfHeight: 297 },
}

interface Props {
  value: PaperSize
  onChange: (v: PaperSize) => void
  className?: string
}

export default function PaperSizeSelector({ value, onChange, className }: Props) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as PaperSize)}>
      <SelectTrigger className={`w-[120px] h-8 ${className || ''}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAPER_SIZES.map(s => (
          <SelectItem key={s.value} value={s.value}>
            <span className="text-xs">{s.label} <span className="text-muted-foreground">({s.desc})</span></span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
