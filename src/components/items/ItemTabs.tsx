import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategories } from '@/hooks/useCategories'
import { useBreakpoint } from '@/lib/breakpoints'
import { cn } from '@/lib/utils'

interface ItemTabsProps {
  activeTab: string
  onTabChange: (categoryId: string) => void
}

interface TabOption {
  value: string
  label: string
  count: number
}

export function ItemTabs({ activeTab, onTabChange }: ItemTabsProps) {
  const { data: categories, isLoading } = useCategories()
  const { isMobile } = useBreakpoint()

  const options = useMemo<TabOption[]>(() => {
    const total = categories?.reduce((s, c) => s + c.items_count, 0) ?? 0
    return [
      { value: 'all', label: 'Tất cả', count: total },
      ...(categories?.map((c) => ({
        value: c.id,
        label: c.name,
        count: c.items_count,
      })) ?? []),
    ]
  }, [categories])

  if (isLoading) {
    return (
      <div className="flex gap-1.5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-20" />
        ))}
      </div>
    )
  }

  if (isMobile) {
    const active = options.find((o) => o.value === activeTab) ?? options[0]
    return (
      <Select value={activeTab} onValueChange={onTabChange}>
        <SelectTrigger className="h-9 w-full text-sm">
          <SelectValue>
            <span className="truncate">
              {active?.label}
              <span className="ml-1.5 text-muted-foreground">
                {active?.count}
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="flex items-center justify-between gap-4 w-full">
                <span>{o.label}</span>
                <span className="text-muted-foreground tabular-nums text-xs">
                  {o.count}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <DesktopChipStrip
      options={options}
      activeTab={activeTab}
      onTabChange={onTabChange}
    />
  )
}

function DesktopChipStrip({
  options,
  activeTab,
  onTabChange,
}: {
  options: TabOption[]
  activeTab: string
  onTabChange: (v: string) => void
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const update = () => {
    const el = scrollerRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 2)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [options.length])

  // Auto-scroll active chip into view
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const node = el.querySelector<HTMLElement>(`[data-tab-value="${activeTab}"]`)
    node?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeTab])

  const scrollBy = (dx: number) => {
    scrollerRef.current?.scrollBy({ left: dx, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      {/* Left chevron */}
      {canLeft && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cuộn trái"
          onClick={() => scrollBy(-220)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 h-8 w-8 bg-background/90 backdrop-blur shadow-sm border"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Fade edges */}
      {canLeft && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-r from-background to-transparent" />
      )}
      {canRight && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-l from-background to-transparent" />
      )}

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList
          ref={scrollerRef as any}
          className={cn(
            'h-9 w-full justify-start gap-0.5 bg-transparent p-0',
            'overflow-x-auto snap-x snap-mandatory',
            '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
            canLeft && 'pl-8',
            canRight && 'pr-8',
          )}
        >
          {options.map((o) => (
            <TabsTrigger
              key={o.value}
              value={o.value}
              data-tab-value={o.value}
              className="snap-start shrink-0 h-8 gap-1.5 px-3 text-xs data-[state=active]:bg-muted"
            >
              {o.label}
              <span className="text-muted-foreground tabular-nums">{o.count}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Right chevron */}
      {canRight && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cuộn phải"
          onClick={() => scrollBy(220)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 h-8 w-8 bg-background/90 backdrop-blur shadow-sm border"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
