import { useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { useCategories } from '@/hooks/useCategories'

interface CategoryMultiSelectProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}

export function CategoryMultiSelect({
  value = [],
  onChange,
  placeholder = 'Chọn danh mục...',
}: CategoryMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const { data: categoriesData, isLoading } = useCategories()
  
  const categories = categoriesData || []
  const selectedCategories = categories.filter(c => value.includes(c.id))

  const toggleCategory = (categoryId: string) => {
    const newValue = value.includes(categoryId)
      ? value.filter(id => id !== categoryId)
      : [...value, categoryId]
    onChange(newValue)
  }

  const removeCategory = (categoryId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(value.filter(id => id !== categoryId))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-10"
        >
          <div className="flex flex-wrap gap-1">
            {selectedCategories.length > 0 ? (
              selectedCategories.map(category => (
                <Badge
                  key={category.id}
                  variant="secondary"
                  className="gap-1"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  {category.name}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => removeCategory(category.id, e)}
                  />
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder="Tìm danh mục..." />
          <CommandEmpty>
            {isLoading ? 'Đang tải...' : 'Không tìm thấy danh mục'}
          </CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {categories.map(category => (
              <CommandItem
                key={category.id}
                value={category.name}
                onSelect={() => toggleCategory(category.id)}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value.includes(category.id) ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span
                  className="mr-2 h-3 w-3 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="flex-1">{category.name}</span>
                <span className="text-xs text-muted-foreground">
                  {category.items_count || 0} items
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
