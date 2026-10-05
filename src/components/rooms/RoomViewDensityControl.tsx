import { Type, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { RoomDensityPreset, RoomViewDensityState } from '@/hooks/useRoomViewDensity'

interface Props {
  state: RoomViewDensityState
  onPresetChange: (p: RoomDensityPreset) => void
  onFontScaleChange: (v: number) => void
  onReset: () => void
}

const PRESETS: { key: RoomDensityPreset; label: string }[] = [
  { key: 'sm', label: 'Nhỏ' },
  { key: 'md', label: 'Vừa' },
  { key: 'lg', label: 'Lớn' },
]

export function RoomViewDensityControl({ state, onPresetChange, onFontScaleChange, onReset }: Props) {
  const pct = Math.round(state.fontScale * 100)
  const currentLabel = PRESETS.find((p) => p.key === state.preset)?.label ?? 'Vừa'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <Type className="h-4 w-4" />
          <span className="text-xs">Cỡ hiển thị: {currentLabel} · {pct}%</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 bg-background">
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">Mật độ</div>
            <div className="grid grid-cols-3 gap-1">
              {PRESETS.map((p) => (
                <Button
                  key={p.key}
                  size="sm"
                  variant={state.preset === p.key ? 'default' : 'outline'}
                  className="h-8"
                  onClick={() => onPresetChange(p.key)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cỡ chữ</span>
              <span className="text-xs font-mono">{pct}%</span>
            </div>
            <Slider
              min={85}
              max={140}
              step={5}
              value={[pct]}
              onValueChange={([v]) => onFontScaleChange(v / 100)}
            />
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-[11px] text-muted-foreground">Phím tắt: Ctrl + / − / 0</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={onReset}>
              <RotateCcw className="h-3 w-3" />
              <span className="text-xs">Đặt lại</span>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
