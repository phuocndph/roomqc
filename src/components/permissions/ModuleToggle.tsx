import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActionDef {
  code: string
  name: string
  color?: string
}

interface ModuleToggleProps {
  moduleName: string
  enabled: boolean
  source: 'role' | 'custom' | null
  onChange: (enabled: boolean) => void
  disabled?: boolean
  actions?: Record<string, boolean>
  onActionChange?: (action: string, enabled: boolean) => void
  applicableActions: ActionDef[]
}

export function ModuleToggle({
  moduleName,
  enabled,
  source,
  onChange,
  disabled = false,
  actions,
  onActionChange,
  applicableActions,
}: ModuleToggleProps) {
  const [expanded, setExpanded] = useState(false)
  
  const hasActionControl = actions && onActionChange && applicableActions.length > 1
  
  // Count enabled actions among applicable ones
  const enabledActions = applicableActions.filter(a => actions?.[a.code])
  const allActionsEnabled = enabledActions.length === applicableActions.length
  const someActionsEnabled = enabledActions.length > 0 && !allActionsEnabled

  // Build summary text for badge
  const actionSummary = someActionsEnabled && enabled
    ? enabledActions.length <= 2
      ? enabledActions.map(a => a.name).join(', ')
      : `${enabledActions.length}/${applicableActions.length} quyền`
    : null

  return (
    <div className={cn(
      "rounded-lg border bg-card overflow-hidden transition-opacity",
      !enabled && "opacity-60"
    )}>
      {/* Module Header */}
      <div className="flex items-center justify-between py-3 px-4 hover:bg-accent/50 transition-colors">
        <div className="flex items-center gap-3 flex-1">
          {hasActionControl && (
            <button
              type="button"
              onClick={() => enabled && setExpanded(!expanded)}
              className={cn(
                "p-0.5 rounded transition-colors",
                enabled ? "hover:bg-accent cursor-pointer" : "cursor-not-allowed opacity-50"
              )}
              disabled={disabled || !enabled}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}
          
          <Switch
            checked={enabled}
            onCheckedChange={onChange}
            disabled={disabled}
          />
          
          <Label 
            className={cn(
              "text-sm font-medium cursor-pointer flex-1",
              !enabled && "text-muted-foreground"
            )}
            onClick={() => !disabled && onChange(!enabled)}
          >
            {moduleName}
          </Label>
        </div>
        
        <div className="flex items-center gap-2">
          {actionSummary && (
            <Badge variant="outline" className="text-xs">
              {actionSummary}
            </Badge>
          )}
          {enabled && allActionsEnabled && applicableActions.length > 1 && (
            <Badge variant="outline" className="text-xs text-green-600 border-green-200">
              Toàn quyền
            </Badge>
          )}
          {!enabled && (
            <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
              Không có quyền
            </Badge>
          )}
          {source && enabled && (
            <Badge variant={source === 'role' ? 'secondary' : 'default'} className="text-xs">
              {source === 'role' ? 'Role' : 'Custom'}
            </Badge>
          )}
        </div>
      </div>

      {/* Actions Detail */}
      {expanded && hasActionControl && enabled && (
        <div className="border-t bg-muted/30 p-4 space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            Tùy chỉnh quyền chi tiết:
          </p>
          
          <div className="grid grid-cols-2 gap-2">
            {applicableActions.map((action) => (
              <div
                key={action.code}
                className="flex items-center gap-2 p-2 rounded bg-background border"
              >
                <Switch
                  checked={actions?.[action.code] || false}
                  onCheckedChange={(checked) => onActionChange!(action.code, checked)}
                  disabled={disabled}
                  className="scale-90"
                />
                <Label className="text-xs cursor-pointer flex-1">
                  {action.name}
                </Label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
