import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WORKFLOW_TEMPLATES, WorkflowTemplate, CATEGORY_LABELS } from './WorkflowTemplates'
import { cn } from '@/lib/utils'

interface WorkflowQuickTemplatesProps {
  onSelect: (template: WorkflowTemplate) => void
}

const CATEGORY_TABS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'housekeeping', label: 'Công việc' },
  { value: 'inventory', label: 'Kho' },
  { value: 'maintenance', label: 'Bảo trì' },
  { value: 'laundry', label: 'Giặt ủi' },
]

export const WorkflowQuickTemplates = ({ onSelect }: WorkflowQuickTemplatesProps) => {
  const [selectedCategory, setSelectedCategory] = useState('all')

  const filteredTemplates = selectedCategory === 'all' 
    ? WORKFLOW_TEMPLATES 
    : WORKFLOW_TEMPLATES.filter(t => t.category === selectedCategory)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground mb-4">
          Chọn một mẫu có sẵn để bắt đầu nhanh. Bạn có thể tùy chỉnh sau khi chọn.
        </p>
      </div>

      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList className="flex-wrap h-auto gap-1">
          {CATEGORY_TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedCategory} className="mt-4">
          <ScrollArea className="h-[350px] pr-3">
            <div className="space-y-2">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className={cn(
                    "flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                    "hover:bg-muted/50 hover:border-primary/50"
                  )}
                  onClick={() => onSelect(template)}
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {template.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm">{template.name}</p>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {CATEGORY_LABELS[template.category]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {template.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {template.actions.length} hành động
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {filteredTemplates.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">Không có mẫu nào trong danh mục này</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
