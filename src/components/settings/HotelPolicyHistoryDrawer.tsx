import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useHotelPolicyHistory, POLICY_KEY_LABELS } from '@/hooks/useHotelPolicy'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  policyKey?: string
}

export function HotelPolicyHistoryDrawer({ open, onOpenChange, policyKey }: Props) {
  const { data: history, isLoading } = useHotelPolicyHistory(policyKey)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">
            Lịch sử thay đổi
          </SheetTitle>
          {policyKey && (
            <p className="text-xs text-muted-foreground">
              {POLICY_KEY_LABELS[policyKey] ?? policyKey}
            </p>
          )}
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {isLoading && <p className="text-xs text-muted-foreground">Đang tải...</p>}
          {!isLoading && (!history || history.length === 0) && (
            <p className="text-xs text-muted-foreground">Chưa có thay đổi nào.</p>
          )}
          {history?.map((h) => (
            <div key={h.id} className="border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">v{h.old_version} → v{h.new_version}</span>
                <span className="text-muted-foreground">
                  {format(new Date(h.changed_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                </span>
              </div>
              {h.changed_role && (
                <p className="text-xs text-muted-foreground">Vai trò: {h.changed_role}</p>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground mb-0.5">Cũ</p>
                  <pre className="bg-muted p-1.5 rounded font-mono text-[10px] overflow-x-auto">
                    {JSON.stringify(h.old_value, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Mới</p>
                  <pre className="bg-muted p-1.5 rounded font-mono text-[10px] overflow-x-auto">
                    {JSON.stringify(h.new_value, null, 2)}
                  </pre>
                </div>
              </div>
              {h.change_reason && (
                <p className="text-xs italic text-muted-foreground">"{h.change_reason}"</p>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
