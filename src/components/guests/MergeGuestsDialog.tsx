import { useState, useMemo } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useGuestsV2, useMergeGuests } from '@/hooks/useGuestsV2'
import type { Guest } from '@/hooks/useGuests'
import { GitMerge } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  target: Guest | null
}

export function MergeGuestsDialog({ open, onOpenChange, target }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const merge = useMergeGuests()

  const initialSearch = useMemo(() => {
    if (!target) return ''
    // Prefill: same phone (last 4 digits) or full name
    return target.phone?.slice(-6) || target.full_name.split(' ').slice(-1)[0] || ''
  }, [target])

  const effectiveSearch = search || initialSearch
  const { data, isLoading } = useGuestsV2({ search: effectiveSearch, pageSize: 30 })
  const candidates = (data?.rows || []).filter(g => g.id !== target?.id)

  if (!target) return null

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const handleMerge = async () => {
    await merge.mutateAsync({ targetId: target.id, sourceIds: Array.from(selected) })
    setSelected(new Set())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSelected(new Set()); setSearch('') } }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-4 w-4" /> Gộp khách hàng trùng
          </DialogTitle>
          <DialogDescription>
            Khách đích: <span className="font-medium text-foreground">{target.full_name}</span>
            {target.phone && <span className="font-mono ml-2">{target.phone}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Tìm khách trùng theo SĐT, tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
          <div className="text-xs text-muted-foreground">
            Chọn các khách hàng sẽ <b>bị gộp vào</b> khách đích. Lịch sử booking sẽ được chuyển sang khách đích, sau đó các khách được chọn sẽ bị xoá.
          </div>
          <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Đang tìm...</div>
            ) : candidates.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Không tìm thấy khách phù hợp</div>
            ) : candidates.map(g => (
              <label key={g.id} className="flex items-center gap-3 p-2 hover:bg-accent/40 cursor-pointer">
                <Checkbox
                  checked={selected.has(g.id)}
                  onCheckedChange={() => toggle(g.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{g.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.phone || '—'} · {g.total_stays} lượt
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button
            type="button"
            onClick={handleMerge}
            disabled={selected.size === 0 || merge.isPending}
          >
            {merge.isPending ? 'Đang gộp...' : `Gộp ${selected.size} khách vào khách đích`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
