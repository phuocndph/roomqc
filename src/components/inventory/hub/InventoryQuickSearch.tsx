import { forwardRef, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useTenant } from '@/hooks/useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils'

interface ItemRow {
  id: string
  name: string
  code: string
  quantity_in_stock: number
  reorder_point: number | null
}

export const InventoryQuickSearch = forwardRef<HTMLInputElement>((_, ref) => {
  const navigate = useNavigate()
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)

  const tenantId = tenant?.id
  const hotelId = !isAllHotelsMode && selectedHotel?.id ? selectedHotel.id : null

  const debounced = useDebounce(q.trim(), 200)

  const { data: results } = useQuery({
    queryKey: ['inv-hub-search', tenantId, hotelId, debounced],
    queryFn: async (): Promise<ItemRow[]> => {
      if (!tenantId || !debounced) return []
      let query = supabase
        .from('items')
        .select('id, name, code, quantity_in_stock, reorder_point')
        .eq('tenant_id', tenantId)
        .or(`name.ilike.%${debounced}%,code.ilike.%${debounced}%`)
        .limit(8)
      if (hotelId) query = query.eq('hotel_id', hotelId)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ItemRow[]
    },
    enabled: !!tenantId && debounced.length >= 1,
    staleTime: 30 * 1000,
  })

  const items = results ?? []

  useEffect(() => {
    setActiveIdx(0)
  }, [debounced])

  const goItem = (id: string) => {
    setOpen(false)
    setQ('')
    // Open the selected item directly; the inventory hub does not consume the
    // old `q`/`highlight` query pair and silently dropped the user's choice.
    navigate(`/items/${id}`)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[activeIdx]) goItem(items[activeIdx].id)
      else if (debounced) {
        setOpen(false)
        navigate(`/items?search=${encodeURIComponent(debounced)}`)
      }
    }
  }

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={ref}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKey}
          placeholder="Tìm item theo tên hoặc mã… (gõ /)"
          className="h-9 pl-8 text-sm"
        />
      </div>
      {open && debounced && (
        <div className="absolute z-50 mt-1 w-full border rounded-lg bg-popover shadow-md max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Không tìm thấy item nào khớp “{debounced}”.
            </div>
          ) : (
            <ul>
              {items.map((it, idx) => {
                const low =
                  it.reorder_point !== null && it.quantity_in_stock <= it.reorder_point
                return (
                  <li
                    key={it.id}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      goItem(it.id)
                    }}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 text-sm cursor-pointer',
                      idx === activeIdx && 'bg-muted',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {it.code}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'text-xs tabular-nums shrink-0 pl-2',
                        low ? 'text-red-600' : 'text-muted-foreground',
                      )}
                    >
                      tồn {it.quantity_in_stock}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
})
InventoryQuickSearch.displayName = 'InventoryQuickSearch'

function useDebounce<T>(value: T, delay = 200) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}
