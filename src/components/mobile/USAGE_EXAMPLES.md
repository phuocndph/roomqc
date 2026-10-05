# Mobile Component Usage Examples

## ResponsiveTable

Automatically converts to cards on mobile:

```tsx
import { ResponsiveTable } from '@/components/mobile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// Your data
const items = [
  { id: 1, code: 'IT001', name: 'Towel', quantity: 45, category: 'Linen' },
  { id: 2, code: 'IT002', name: 'Soap', quantity: 5, category: 'Amenities' }
]

// Column definitions
const columns = [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Name' },
  { 
    key: 'quantity', 
    label: 'Quantity',
    render: (item) => (
      <Badge variant={item.quantity < 10 ? 'destructive' : 'default'}>
        {item.quantity}
      </Badge>
    )
  },
  { key: 'category', label: 'Category' }
]

// Mobile card renderer
const renderMobileCard = (item, index) => (
  <div className="space-y-2">
    <div className="flex justify-between items-start">
      <div>
        <h3 className="font-semibold">{item.name}</h3>
        <p className="text-sm text-muted-foreground">{item.code}</p>
      </div>
      <Badge variant={item.quantity < 10 ? 'destructive' : 'default'}>
        {item.quantity}
      </Badge>
    </div>
    <p className="text-sm">Category: {item.category}</p>
    <div className="flex gap-2 pt-2">
      <Button size="sm" variant="outline" className="flex-1">
        Edit
      </Button>
      <Button size="sm" variant="outline" className="flex-1">
        View
      </Button>
    </div>
  </div>
)

// Usage
<ResponsiveTable
  data={items}
  columns={columns}
  mobileCardRenderer={renderMobileCard}
  emptyMessage="No items found"
/>
```

## ResponsiveDialog

Becomes a bottom sheet on mobile:

```tsx
import { ResponsiveDialog } from '@/components/mobile'
import { Button } from '@/components/ui/button'

const [open, setOpen] = useState(false)

<ResponsiveDialog
  open={open}
  onOpenChange={setOpen}
  trigger={<Button>Open Form</Button>}
  title="Add New Item"
  description="Fill in the details below"
>
  <form className="space-y-4">
    {/* Your form content */}
  </form>
</ResponsiveDialog>
```

## TouchButton

Touch-optimized buttons (48px minimum):

```tsx
import { TouchButton } from '@/components/mobile'

// Automatically touch-optimized
<TouchButton onClick={handleClick}>
  Click Me
</TouchButton>

// Disable touch optimization if needed
<TouchButton touchOptimized={false}>
  Regular Button
</TouchButton>
```

## MobileItemCard

Pre-built card for item display:

```tsx
import { MobileItemCard } from '@/components/mobile'

<MobileItemCard
  item={{
    code: 'IT001',
    name: 'Towel',
    category: 'Linen',
    quantity: 45,
    unit: 'pcs',
    location: 'Storage A',
    status: 'Active'
  }}
  onView={() => navigate(\`/items/\${item.id}\`)}
  onEdit={() => navigate(\`/items/\${item.id}/edit\`)}
  onDelete={() => handleDelete(item.id)}
/>
```

## MobileStatCard with Horizontal Scroll

Dashboard stats with horizontal scrolling:

```tsx
import { MobileStatCard, StatScrollContainer } from '@/components/mobile'
import { Package, AlertTriangle, Shirt, Wrench } from 'lucide-react'

<StatScrollContainer>
  <MobileStatCard
    icon={Package}
    title="Total Items"
    value={stats.total_items}
    trend="+12%"
  />
  <MobileStatCard
    icon={AlertTriangle}
    title="Low Stock"
    value={stats.low_stock}
    variant="warning"
  />
  <MobileStatCard
    icon={Shirt}
    title="In Laundry"
    value={stats.in_laundry}
  />
  <MobileStatCard
    icon={Wrench}
    title="Maintenance"
    value={stats.maintenance}
  />
</StatScrollContainer>
```

## SwipeableCard

Add swipe gestures to cards:

```tsx
import { SwipeableCard } from '@/components/mobile'
import { Card } from '@/components/ui/card'

<SwipeableCard
  onSwipeLeft={() => console.log('Swiped left')}
  onSwipeRight={() => console.log('Swiped right')}
  threshold={50}
>
  <Card className="p-4">
    <p>Swipe me!</p>
  </Card>
</SwipeableCard>
```

## PullToRefresh

Pull-to-refresh functionality:

```tsx
import { PullToRefresh } from '@/components/mobile'

const handleRefresh = async () => {
  await queryClient.invalidateQueries(['items'])
}

<PullToRefresh onRefresh={handleRefresh} threshold={80}>
  <div className="p-4">
    {/* Your content */}
  </div>
</PullToRefresh>
```

## Combining Components

Full example with multiple patterns:

```tsx
import {
  ResponsiveTable,
  ResponsiveDialog,
  TouchButton,
  PullToRefresh,
  StatScrollContainer,
  MobileStatCard
} from '@/components/mobile'

function ItemsPage() {
  const { data: items, refetch } = useItems()
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleRefresh = async () => {
    await refetch()
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="p-4 space-y-4">
        {/* Stats */}
        <StatScrollContainer>
          <MobileStatCard icon={Package} title="Total" value={items.length} />
          <MobileStatCard icon={AlertTriangle} title="Low Stock" value={5} variant="warning" />
        </StatScrollContainer>

        {/* Add Button */}
        <TouchButton onClick={() => setDialogOpen(true)} className="w-full">
          Add New Item
        </TouchButton>

        {/* Table/Cards */}
        <ResponsiveTable
          data={items}
          columns={columns}
          mobileCardRenderer={renderMobileCard}
        />

        {/* Form Dialog */}
        <ResponsiveDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Add Item"
        >
          <ItemForm onSuccess={() => setDialogOpen(false)} />
        </ResponsiveDialog>
      </div>
    </PullToRefresh>
  )
}
```

## CSS Utilities

Use the mobile CSS utilities:

```tsx
// Horizontal scroll with snap points
<div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x">
  <Card className="min-w-[140px] snap-start">Card 1</Card>
  <Card className="min-w-[140px] snap-start">Card 2</Card>
  <Card className="min-w-[140px] snap-start">Card 3</Card>
</div>

// Touch-optimized button
<button className="touch-target touch-manipulation active:scale-95">
  Tap Me
</button>

// Pan gestures
<div className="touch-pan-y overflow-y-auto">
  Vertically scrollable content
</div>
```
