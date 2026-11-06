import { useId, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'

export function ModuleToggle({ moduleName, actions, inherited, delegatable, onActionChange, onChange, disabled, applicableActions }: {
  moduleName: string; actions: Record<string, boolean>; inherited: Record<string, boolean>;
  delegatable: Record<string, boolean>;
  onActionChange: (action: string, enabled: boolean) => void; onChange: (enabled: boolean) => void;
  disabled?: boolean; applicableActions: { code: string; name: string }[]
}) {
  const [expanded, setExpanded] = useState(false), id = useId()
  const additional = applicableActions.filter(a => actions[a.code]).length
  const fromRole = applicableActions.filter(a => inherited[a.code]).length
  const effective = applicableActions.filter(a => inherited[a.code] || actions[a.code]).length
  const editable = applicableActions.filter(a => delegatable[a.code] || actions[a.code])
  return <section className="overflow-hidden rounded-lg border bg-background">
    <div className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{moduleName}</h3>
        <p className="text-xs text-muted-foreground">Đang có {effective}/{applicableActions.length} quyền · {fromRole} từ vai trò · {additional} bổ sung</p>
      </div>
      <Switch checked={editable.length > 0 && editable.every(a => actions[a.code])} onCheckedChange={onChange}
        disabled={disabled || editable.length === 0} aria-label={`Cấp thêm các quyền được phép: ${moduleName}`} />
      <Button type="button" variant="ghost" size="sm" aria-label={`Chi tiết quyền ${moduleName}`}
        aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        Chi tiết <ChevronDown className={`ml-1 h-4 w-4 ${expanded ? 'rotate-180' : ''}`} />
      </Button>
    </div>
    {expanded && <div id={id} className="grid grid-cols-1 gap-2 border-t p-3 sm:grid-cols-2">
      {applicableActions.map(action => <div key={action.code} className="flex items-center gap-2 rounded border p-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm">{action.name}</p>
          {inherited[action.code] && <Badge variant="outline" className="text-xs">Kế thừa từ vai trò</Badge>}
          {!inherited[action.code] && !actions[action.code] && <p className="text-xs text-muted-foreground">Chưa cấp quyền</p>}
          {!delegatable[action.code] && <p className="text-xs text-muted-foreground">Bạn không thể cấp thêm quyền này</p>}
        </div>
        <Switch checked={!!actions[action.code]} disabled={disabled || (!delegatable[action.code] && !actions[action.code])}
          aria-label={`Quyền bổ sung ${action.name}: ${moduleName}`}
          onCheckedChange={checked => onActionChange(action.code, checked)} />
      </div>)}
    </div>}
  </section>
}
