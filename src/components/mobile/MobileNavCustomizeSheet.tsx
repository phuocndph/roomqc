import { useEffect, useMemo, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useUser } from '@/hooks/useUser'
import { useUserModulePermissions, type PermissionSummary } from '@/hooks/useUserModulePermissions'
import { useMobileNavPreferences, MAX_CUSTOM_TABS } from '@/hooks/useMobileNavPreferences'
import { NAV_TABS_POOL } from '@/components/layout/mobileNavTabs'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileNavCustomizeSheet({ open, onOpenChange }: Props) {
  const { role } = useUser()
  const { data: modulePermissions } = useUserModulePermissions()
  const { selectedIds, setSelectedIds, reset, isCustomized } = useMobileNavPreferences()

  const isPrivileged = role === 'super_admin' || role === 'owner'

  const hasModuleAccess = (modules?: string[]): boolean => {
    if (!modules || modules.length === 0) return true
    if (isPrivileged) return true
    if (!modulePermissions) return false
    return modules.some((module) => {
      const p = modulePermissions.find((x: PermissionSummary) => x.module === module)
      if (!p) return false
      return p.can_view || p.can_create || p.can_update || p.can_delete
    })
  }

  // Chỉ các tab không pinned
  const candidates = useMemo(() => NAV_TABS_POOL.filter((t) => !t.pinned), [])

  const defaultSelection = useMemo(
    () =>
      candidates
        .filter((t) => hasModuleAccess(t.modules))
        .slice(0, MAX_CUSTOM_TABS)
        .map((t) => t.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, modulePermissions, isPrivileged]
  )

  const [draft, setDraft] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setDraft(selectedIds ?? defaultSelection)
    }
  }, [open, selectedIds, defaultSelection])

  const toggle = (id: string, allowed: boolean) => {
    if (!allowed) return
    setDraft((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= MAX_CUSTOM_TABS) {
        toast.warning(`Chỉ chọn được tối đa ${MAX_CUSTOM_TABS} mục`)
        return prev
      }
      return [...prev, id]
    })
  }

  const handleSave = () => {
    setSelectedIds(draft)
    toast.success('Đã lưu thanh điều hướng')
    onOpenChange(false)
  }

  const handleReset = () => {
    reset()
    toast.success('Đã khôi phục mặc định')
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] p-0 flex flex-col rounded-t-2xl"
      >
        <SheetHeader className="px-4 pt-5 pb-3 text-left border-b">
          <SheetTitle>Tùy chỉnh thanh dưới</SheetTitle>
          <SheetDescription>
            Chọn tối đa {MAX_CUSTOM_TABS} mục hiển thị giữa Home và Thêm.
          </SheetDescription>
          <div className="text-xs text-muted-foreground pt-1">
            Đã chọn <span className="font-semibold text-foreground">{draft.length}</span>/{MAX_CUSTOM_TABS}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {candidates.map((tab) => {
            const Icon = tab.icon
            const allowed = hasModuleAccess(tab.modules)
            const checked = draft.includes(tab.id)
            const disabledByLimit = !checked && draft.length >= MAX_CUSTOM_TABS

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => allowed && toggle(tab.id, allowed)}
                disabled={!allowed}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors',
                  allowed ? 'hover:bg-accent active:bg-accent' : 'opacity-50 cursor-not-allowed',
                  disabledByLimit && allowed && 'opacity-60'
                )}
              >
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{tab.label}</div>
                  {!allowed && (
                    <Badge variant="secondary" className="mt-0.5 text-[10px]">
                      Không có quyền
                    </Badge>
                  )}
                </div>
                <Checkbox
                  checked={checked}
                  disabled={!allowed || disabledByLimit}
                  onCheckedChange={() => toggle(tab.id, allowed)}
                  onClick={(e) => e.stopPropagation()}
                />
              </button>
            )
          })}
        </div>

        <div
          className="border-t bg-background p-3 flex gap-2"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <Button
            variant="ghost"
            className="flex-1"
            onClick={handleReset}
            disabled={!isCustomized}
          >
            Khôi phục mặc định
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            Lưu
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
