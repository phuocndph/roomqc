import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import { DEPARTMENTS } from './AddTelegramGroupDialog'

interface BulkAddGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (groups: ParsedGroup[]) => void
  isLoading?: boolean
  selectedHotel?: { id: string; name: string } | null
}

export interface ParsedGroup {
  chatId: string
  title: string
  department: string | null
  groupType: string
  notificationTypes: string[]
  isValid: boolean
  error?: string
}

const TEMPLATES = {
  small: {
    label: 'Khách sạn nhỏ',
    description: '3 nhóm: Staff, Management, General',
    groups: [
      { department: null, groupType: 'staff', title: 'Nhóm Nhân viên' },
      { department: null, groupType: 'management', title: 'Nhóm Quản lý' },
      { department: null, groupType: 'general', title: 'Nhóm Chung' },
    ]
  },
  medium: {
    label: 'Khách sạn trung',
    description: '5 nhóm theo department chính',
    groups: [
      { department: 'housekeeping', groupType: 'staff', title: 'Buồng phòng' },
      { department: 'maintenance', groupType: 'staff', title: 'Bảo trì' },
      { department: 'front_desk', groupType: 'staff', title: 'Lễ tân' },
      { department: null, groupType: 'management', title: 'Quản lý' },
      { department: null, groupType: 'general', title: 'Chung' },
    ]
  },
  large: {
    label: 'Khách sạn lớn',
    description: '6 nhóm đầy đủ department',
    groups: [
      { department: 'housekeeping', groupType: 'staff', title: 'Buồng phòng' },
      { department: 'maintenance', groupType: 'staff', title: 'Bảo trì' },
      { department: 'laundry', groupType: 'staff', title: 'Giặt là' },
      { department: 'inventory', groupType: 'staff', title: 'Kho' },
      { department: 'front_desk', groupType: 'staff', title: 'Lễ tân' },
      { department: null, groupType: 'management', title: 'Quản lý' },
    ]
  }
}

const DEFAULT_NOTIFICATION_TYPES: Record<string, string[]> = {
  housekeeping: ['checkout', 'checkin'],
  maintenance: ['maintenance_new', 'maintenance_urgent'],
  laundry: ['laundry_received', 'laundry_overdue'],
  inventory: ['inventory_low', 'inventory_critical'],
  front_desk: ['checkout', 'checkin', 'booking'],
  accounting: ['payment'],
}

function getDepartmentLabel(dept: string): string {
  const found = DEPARTMENTS.find(d => d.value === dept.toLowerCase())
  return found?.label || dept
}

function parseBulkInput(text: string): ParsedGroup[] {
  if (!text.trim()) return []
  
  const lines = text.trim().split('\n').filter(line => line.trim())
  
  return lines.map(line => {
    const trimmed = line.trim()
    
    // Format 1: "department: chatId" (e.g., "housekeeping: -1001234567890")
    if (trimmed.includes(':') && !trimmed.startsWith('-')) {
      const [dept, chatId] = trimmed.split(':').map(s => s.trim())
      const department = dept.toLowerCase()
      const isValidDept = DEPARTMENTS.some(d => d.value === department) || department === 'management' || department === 'general'
      
      if (!chatId || !chatId.match(/^-?\d+$/)) {
        return {
          chatId: chatId || '',
          title: getDepartmentLabel(department),
          department: isValidDept ? department : null,
          groupType: department === 'management' ? 'management' : 'staff',
          notificationTypes: DEFAULT_NOTIFICATION_TYPES[department] || [],
          isValid: false,
          error: 'Chat ID không hợp lệ'
        }
      }
      
      return {
        chatId,
        title: `Nhóm ${getDepartmentLabel(department)}`,
        department: isValidDept && department !== 'management' && department !== 'general' ? department : null,
        groupType: department === 'management' ? 'management' : department === 'general' ? 'general' : 'staff',
        notificationTypes: DEFAULT_NOTIFICATION_TYPES[department] || [],
        isValid: true
      }
    }
    
    // Format 2: "chatId, title, department" (e.g., "-1001234567890, Nhóm ABC, housekeeping")
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',').map(s => s.trim())
      const chatId = parts[0]
      const title = parts[1] || `Nhóm ${chatId}`
      const department = parts[2]?.toLowerCase() || null
      
      if (!chatId.match(/^-?\d+$/)) {
        return {
          chatId,
          title,
          department,
          groupType: 'staff',
          notificationTypes: [],
          isValid: false,
          error: 'Chat ID không hợp lệ'
        }
      }
      
      return {
        chatId,
        title,
        department: department && DEPARTMENTS.some(d => d.value === department) ? department : null,
        groupType: 'staff',
        notificationTypes: department ? DEFAULT_NOTIFICATION_TYPES[department] || [] : [],
        isValid: true
      }
    }
    
    // Format 3: Just chatId
    if (trimmed.match(/^-?\d+$/)) {
      return {
        chatId: trimmed,
        title: `Nhóm ${trimmed.slice(-6)}`,
        department: null,
        groupType: 'staff',
        notificationTypes: [],
        isValid: true
      }
    }
    
    return {
      chatId: trimmed,
      title: '',
      department: null,
      groupType: 'staff',
      notificationTypes: [],
      isValid: false,
      error: 'Định dạng không hợp lệ'
    }
  })
}

export function BulkAddGroupDialog({ 
  open, 
  onOpenChange, 
  onSubmit, 
  isLoading,
  selectedHotel 
}: BulkAddGroupDialogProps) {
  const [inputText, setInputText] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  const parsedGroups = useMemo(() => {
    if (selectedTemplate && TEMPLATES[selectedTemplate as keyof typeof TEMPLATES]) {
      // Template mode - just show template groups (no chatIds yet)
      return []
    }
    return parseBulkInput(inputText)
  }, [inputText, selectedTemplate])

  const validGroups = parsedGroups.filter(g => g.isValid)
  const invalidGroups = parsedGroups.filter(g => !g.isValid)

  const handleTemplateChange = (value: string) => {
    setSelectedTemplate(value === selectedTemplate ? null : value)
    if (value) {
      // Generate placeholder text for template
      const template = TEMPLATES[value as keyof typeof TEMPLATES]
      if (template) {
        const lines = template.groups.map(g => 
          `${g.department || g.groupType}: [paste_chat_id_here]`
        )
        setInputText(lines.join('\n'))
      }
    }
  }

  const handleSubmit = () => {
    if (validGroups.length > 0) {
      onSubmit(validGroups)
    }
  }

  const handleClose = () => {
    setInputText('')
    setSelectedTemplate(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Thiết lập nhanh nhóm Telegram
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Selection */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Chọn template (tùy chọn)</Label>
            <RadioGroup value={selectedTemplate || ''} onValueChange={handleTemplateChange}>
              {Object.entries(TEMPLATES).map(([key, template]) => (
                <div key={key} className="flex items-center space-x-2">
                  <RadioGroupItem value={key} id={key} />
                  <Label htmlFor={key} className="text-sm cursor-pointer">
                    <span className="font-medium">{template.label}</span>
                    <span className="text-muted-foreground ml-1">- {template.description}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Input Area */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Dán danh sách Chat ID theo một trong các định dạng:
            </Label>
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border font-mono space-y-1">
              <div>housekeeping: -1001234567890</div>
              <div>-1001234567891, Nhóm ABC, maintenance</div>
              <div>-1001234567892</div>
            </div>
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Dán danh sách Chat ID vào đây..."
              className="min-h-[120px] font-mono text-sm"
            />
          </div>

          {/* Preview */}
          {parsedGroups.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Preview ({validGroups.length} hợp lệ, {invalidGroups.length} lỗi)
              </Label>
              <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
                {parsedGroups.map((group, index) => (
                  <div 
                    key={index} 
                    className={`p-2 text-sm flex items-start gap-2 ${!group.isValid ? 'bg-destructive/5' : ''}`}
                  >
                    {group.isValid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{group.title || 'Không có tên'}</div>
                      <div className="text-xs text-muted-foreground font-mono">{group.chatId}</div>
                      {group.department && (
                        <div className="text-xs text-muted-foreground">
                          {getDepartmentLabel(group.department)}
                        </div>
                      )}
                      {group.error && (
                        <div className="text-xs text-destructive">{group.error}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hotel info */}
          {selectedHotel && (
            <div className="text-xs text-muted-foreground">
              Các nhóm sẽ được gán cho: <span className="font-medium">{selectedHotel.name}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Hủy
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={validGroups.length === 0 || isLoading}
          >
            {isLoading ? 'Đang tạo...' : `Tạo ${validGroups.length} nhóm`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
