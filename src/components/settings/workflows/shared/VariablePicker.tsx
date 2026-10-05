import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Code } from 'lucide-react'

interface Variable {
  key: string
  description: string
}

interface VariablePickerProps {
  triggerType: string
  onSelect: (variable: string) => void
}

export const VariablePicker = ({ triggerType, onSelect }: VariablePickerProps) => {
  const variables = getAvailableVariables(triggerType)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Code className="w-4 h-4 mr-2" />
          Insert Variable
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Available Variables</h4>
          <ScrollArea className="h-60">
            <div className="space-y-1">
              {variables.map((variable) => (
                <Button
                  key={variable.key}
                  variant="ghost"
                  className="w-full justify-start text-left h-auto py-2"
                  onClick={() => onSelect(`{{${variable.key}}}`)}
                >
                  <div>
                    <div className="font-mono text-sm">{`{{${variable.key}}}`}</div>
                    <div className="text-xs text-muted-foreground">{variable.description}</div>
                  </div>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function getAvailableVariables(triggerType: string): Variable[] {
  const commonVars: Variable[] = [
    { key: 'timestamp', description: 'Current timestamp' },
    { key: 'date', description: 'Current date' },
    { key: 'hotel_name', description: 'Hotel name' },
    { key: 'hotel_id', description: 'Hotel ID' },
  ]

  const triggerVars: Record<string, Variable[]> = {
    'inventory.low_stock': [
      { key: 'item_name', description: 'Item name' },
      { key: 'item_code', description: 'Item code' },
      { key: 'current_qty', description: 'Current quantity' },
      { key: 'min_qty', description: 'Minimum quantity' },
      { key: 'category', description: 'Category name' },
      { key: 'location', description: 'Storage location' },
    ],
    'laundry.overdue': [
      { key: 'batch_code', description: 'Batch code' },
      { key: 'vendor_name', description: 'Vendor name' },
      { key: 'sent_date', description: 'Date sent' },
      { key: 'expected_date', description: 'Expected return date' },
      { key: 'overdue_hours', description: 'Hours overdue' },
      { key: 'total_weight', description: 'Total weight' },
    ],
    'maintenance.overdue': [
      { key: 'request_code', description: 'Request code' },
      { key: 'title', description: 'Request title' },
      { key: 'category', description: 'Category' },
      { key: 'priority', description: 'Priority' },
      { key: 'due_date', description: 'Due date' },
      { key: 'overdue_hours', description: 'Hours overdue' },
    ],
  }

  return [...commonVars, ...(triggerVars[triggerType] || [])]
}
