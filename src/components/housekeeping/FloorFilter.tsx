import { cn } from '@/lib/utils'

interface FloorFilterProps {
  floors: number[]
  taskCountByFloor: Record<number, number>
  totalCount: number
  selectedFloor: number | null
  onSelect: (floor: number | null) => void
}

export function FloorFilter({ floors, taskCountByFloor, totalCount, selectedFloor, onSelect }: FloorFilterProps) {
  if (floors.length <= 1) return null

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 px-4 scrollbar-hide">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
          selectedFloor === null
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-background text-muted-foreground border-border hover:bg-muted'
        )}
      >
        Tất cả ({totalCount})
      </button>
      {floors.map(floor => (
        <button
          key={floor}
          type="button"
          onClick={() => onSelect(floor)}
          className={cn(
            'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
            selectedFloor === floor
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:bg-muted'
          )}
        >
          T.{floor} ({taskCountByFloor[floor] || 0})
        </button>
      ))}
    </div>
  )
}
