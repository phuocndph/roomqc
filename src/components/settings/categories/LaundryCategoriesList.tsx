import { useState } from 'react'
import { Plus, Search, Shirt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useLaundryCategories } from '@/hooks/useLaundryCategories'
import { Skeleton } from '@/components/ui/skeleton'

export function LaundryCategoriesList() {
  const [search, setSearch] = useState('')
  const { data: categories, isLoading } = useLaundryCategories()

  const filteredCategories = categories?.filter(
    (cat) =>
      cat.name.toLowerCase().includes(search.toLowerCase()) ||
      cat.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filteredCategories && filteredCategories.length > 0 ? (
        <div className="space-y-3">
          {filteredCategories.map((category) => (
            <Card key={category.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🧺</div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{category.name}</h3>
                    <Badge variant="secondary">{category.code}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {category.price_per_kg && (
                      <span>💰 {category.price_per_kg.toLocaleString()} VND/kg</span>
                    )}
                    <span>⏱️ {category.standard_turnaround_hours}h standard</span>
                    {category.express_turnaround_hours && (
                      <span>⚡ {category.express_turnaround_hours}h express</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Shirt className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No laundry categories found</p>
        </div>
      )}
    </div>
  )
}
