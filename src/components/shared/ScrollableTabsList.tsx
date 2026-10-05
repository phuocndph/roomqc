import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { TabsList } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ScrollableTabsListProps {
  children: ReactNode
  className?: string
  /** className passed to the underlying TabsList */
  listClassName?: string
}

/**
 * Wrapper around shadcn <TabsList> that hides the native horizontal scrollbar
 * and adds fade edges + chevron buttons when content overflows.
 * Auto-scrolls the active trigger into view.
 */
export function ScrollableTabsList({ children, className, listClassName }: ScrollableTabsListProps) {
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
    // Observe children size changes too (badges loading async)
    Array.from(el.children).forEach((c) => ro.observe(c as Element))
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [children])

  // Auto-scroll active trigger into view
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const active = el.querySelector<HTMLElement>('[data-state="active"]')
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  })

  const scrollBy = (dx: number) => {
    scrollerRef.current?.scrollBy({ left: dx, behavior: 'smooth' })
  }

  // Pass ref through to TabsList (Radix forwards it)
  const childArray = Children.toArray(children)
  const tabsListChild = childArray.find(
    (c) => isValidElement(c) && (c.type as any) === TabsList,
  )

  const enhancedList = isValidElement(tabsListChild)
    ? cloneElement(tabsListChild as any, {
        ref: scrollerRef,
        className: cn(
          tabsListChild.props.className,
          'max-w-full justify-start overflow-x-auto',
          '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
          'snap-x snap-mandatory',
          listClassName,
        ),
      })
    : (
      <TabsList
        ref={scrollerRef as any}
        className={cn(
          'max-w-full justify-start overflow-x-auto',
          '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
          'snap-x snap-mandatory',
          listClassName,
        )}
      >
        {children}
      </TabsList>
    )

  return (
    <div className={cn('relative', className)}>
      {canLeft && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-r from-background to-transparent" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cuộn trái"
            onClick={() => scrollBy(-220)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 h-7 w-7 bg-background/90 backdrop-blur shadow-sm border"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </>
      )}
      {canRight && (
        <>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-l from-background to-transparent" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cuộn phải"
            onClick={() => scrollBy(220)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 h-7 w-7 bg-background/90 backdrop-blur shadow-sm border"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      )}
      {enhancedList}
    </div>
  )
}
