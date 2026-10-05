import { ChevronRight } from 'lucide-react'

interface Props {
  groupTitle?: string
  itemLabel?: string
}

export function InventoryHubBreadcrumb({ groupTitle, itemLabel }: Props) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-xs text-muted-foreground"
    >
      <span>Kho</span>
      {groupTitle && (
        <>
          <ChevronRight className="h-3 w-3" />
          <span>{groupTitle}</span>
        </>
      )}
      {itemLabel && (
        <>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">{itemLabel}</span>
        </>
      )}
    </nav>
  )
}
