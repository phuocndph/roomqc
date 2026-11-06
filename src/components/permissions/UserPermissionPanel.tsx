import { useId, useState } from 'react'
import type { UserWithRelations } from '@/types/database.types'
import { useUserPermissionConfiguration } from '@/hooks/useUserPermissionConfiguration'
import { MODULES, ACTIONS } from '@/hooks/useUserPermissions'
import { canonicalGrants, type AdditionalGrant, type AuthorityConfiguration } from '@/lib/employee-authority'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ModuleToggle } from './ModuleToggle'
import { AuthoritySaveNotice } from './AuthoritySaveNotice'
import { HotelAssignmentSection } from './HotelAssignmentSection'

type Authority = ReturnType<typeof useUserPermissionConfiguration>
const grantKey = (g: { module: string; action: string }) => JSON.stringify([g.module, g.action])

export function UserPermissionPanel({ user }: { user: UserWithRelations | null }) {
  if (!user) return <p className="p-6 text-sm text-muted-foreground">Chọn nhân viên để xem và điều chỉnh quyền.</p>
  return <EmployeeAuthorityPanel key={user.id} user={user} />
}

function EmployeeAuthorityPanel({ user }: { user: UserWithRelations }) {
  const protectedTarget = user.is_super_admin || ['tenant_owner', 'super_admin'].includes(user.user_level_code)
  const revision = JSON.stringify([user.tenant_id, user.hotel_id, user.user_level_code, user.updated_at,
    user.status, user.deleted_at, user.account_locked, user.reports_to, user.roles?.map(r => r.role).sort()])
  const authority = useUserPermissionConfiguration(user.id, !protectedTarget, revision)
  return <div className="flex h-full min-h-0 flex-col bg-background">
    <div className="space-y-1 border-b p-4">
      <h2 className="font-semibold">{user.full_name}</h2>
      <p className="break-all text-sm text-muted-foreground">{user.email}</p>
    </div>
    {protectedTarget ? <p className="p-4 text-sm" role="status">Tài khoản chủ sở hữu hoặc quản trị hệ thống được quản lý theo vai trò. Không chỉnh quyền qua màn phân quyền nhân viên này.</p>
      : <AuthorityEditor key={authority.scope} authority={authority} />}
  </div>
}

function AuthorityEditor({ authority }: { authority: Authority }) {
  const id = useId()
  const [tab, setTab] = useState<'grants' | 'hotels'>('grants')
  const { data } = authority
  const recover = (kind: 'grants' | 'hotels') => { void authority.recover(kind).catch(() => { /* Hook displays a scoped safe notice. */ }) }
  return <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
    <AuthoritySaveNotice notice={authority.notice} pendingCount={authority.pending[tab].length}
      busy={authority.isSaving} onRecover={() => recover(tab)} />
    {!authority.isReady && <p role="status" className="text-sm">Phiên hiện tại không đủ điều kiện quản lý nhân viên này. Vui lòng kiểm tra tài khoản và quyền quản lý.</p>}
    {authority.isLoading && <div className="flex justify-center py-8"><LoadingSpinner /></div>}
    {authority.isReady && !authority.isLoading && !data && <Button type="button" variant="outline" onClick={() => { void authority.refresh() }}>Tải lại cấu hình</Button>}
    {data && <>
      <div className="flex gap-2" role="tablist" aria-label="Phân quyền nhân viên">
        <Button type="button" id={`${id}-grants-tab`} role="tab" aria-selected={tab === 'grants'} aria-controls={`${id}-grants-panel`}
          variant={tab === 'grants' ? 'default' : 'outline'} onClick={() => setTab('grants')}>Quyền sử dụng</Button>
        <Button type="button" id={`${id}-hotels-tab`} role="tab" aria-selected={tab === 'hotels'} aria-controls={`${id}-hotels-panel`}
          variant={tab === 'hotels' ? 'default' : 'outline'} onClick={() => setTab('hotels')}>Khách sạn</Button>
      </div>
      <section id={`${id}-grants-panel`} role="tabpanel" aria-labelledby={`${id}-grants-tab`} hidden={tab !== 'grants'}>
        <GrantEditor configuration={data} authority={authority} />
      </section>
      <section id={`${id}-hotels-panel`} role="tabpanel" aria-labelledby={`${id}-hotels-tab`} hidden={tab !== 'hotels'}>
        <HotelAssignmentSection configuration={data} disabled={!authority.pendingReady || authority.pending.hotels.length > 0}
          isSaving={authority.isSaving} onRefresh={() => { void authority.refresh() }}
          onSave={(values, version) => authority.save('hotels', values, version)} />
      </section>
    </>}
  </div>
}

function GrantEditor({ configuration, authority }: { configuration: AuthorityConfiguration; authority: Authority }) {
  const [draft, setDraft] = useState<{ values: AdditionalGrant[]; original: string; version: string } | null>(null)
  const values = draft?.values ?? configuration.grants, catalog = new Map(configuration.actions.map(a => [grantKey(a), a]))
  const unknown = values.filter(g => !catalog.has(grantKey(g)))
  const unheld = values.filter(g => g.enabled && catalog.has(grantKey(g)) && !catalog.get(grantKey(g))!.delegatable)
  const stale = !!draft && draft.version !== configuration.versions.grants
  const dirty = !!draft && JSON.stringify(draft.values) !== draft.original
  const disabled = authority.isSaving || !authority.pendingReady || authority.pending.grants.length > 0 || stale
  const change = (next: AdditionalGrant[]) => setDraft(previous => ({ values: canonicalGrants(next),
    original: previous?.original ?? JSON.stringify(configuration.grants), version: previous?.version ?? configuration.versions.grants }))
  const toggle = (module: string, action: string, enabled: boolean) => {
    if (disabled || (enabled && !catalog.get(grantKey({ module, action }))?.delegatable)) return
    const next = values.filter(g => g.module !== module || g.action !== action)
    // Preserve existing explicit false rows; undoing a newly added grant returns to the original payload.
    if (enabled || configuration.grants.some(g => g.module === module && g.action === action)) next.push({ module, action, enabled })
    change(next)
  }
  const modules = [...new Set(configuration.actions.map(a => a.module))]
  async function save() {
    if (!draft || !dirty || disabled || unknown.length || unheld.length) return
    try { await authority.save('grants', draft.values, draft.version); setDraft(null) } catch { /* Preserve the draft and its base revision. */ }
  }
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Quyền đang có gồm quyền kế thừa từ vai trò và quyền bổ sung. Tắt quyền bổ sung không gỡ quyền của vai trò.</p>
    {stale && <p role="status" className="rounded border p-3 text-sm">Cấu hình đã thay đổi ở nơi khác. Bản nháp được giữ để bạn xem lại; bỏ thay đổi và tải lại trước khi lưu.</p>}
    {unheld.length > 0 && <p role="status" className="rounded border p-3 text-sm">Có quyền bổ sung hiện tại vượt phạm vi bạn được phép cấp. Nhờ người có thẩm quyền rà soát hoặc tắt các quyền này trước khi lưu.</p>}
    {unknown.length > 0 && <div className="space-y-2 rounded border p-3 text-sm" role="status">
      <p>Có cấu hình cũ không còn trong danh mục. Các cấu hình này được giữ nguyên; cần rà soát trước khi lưu.</p>
      {unknown.map(g => <div key={grantKey(g)} className="flex flex-wrap items-center justify-between gap-2">
        <span>{g.module} / {g.action}: {g.enabled ? 'Đã cấp bổ sung' : 'Không cấp bổ sung'}</span>
        <Button type="button" size="sm" variant="outline" disabled={disabled}
          onClick={() => change(values.filter(v => grantKey(v) !== grantKey(g)))}>Bỏ cấu hình cũ {g.module}/{g.action}</Button>
      </div>)}
    </div>}
    {modules.map(module => {
      const actions = configuration.actions.filter(a => a.module === module)
      return <ModuleToggle key={module} moduleName={MODULES.find(m => m.code === module)?.name ?? module}
        actions={Object.fromEntries(actions.map(a => [a.action, values.some(g => g.module === module && g.action === a.action && g.enabled)]))}
        inherited={Object.fromEntries(actions.map(a => [a.action, a.inherited]))}
        delegatable={Object.fromEntries(actions.map(a => [a.action, a.delegatable]))}
        disabled={disabled} applicableActions={actions.map(a => ({ code: a.action, name: ACTIONS.find(v => v.code === a.action)?.name ?? a.action }))}
        onActionChange={(action, enabled) => toggle(module, action, enabled)}
        onChange={enabled => {
          const next = values.filter(g => g.module !== module || !actions.some(a => a.action === g.action))
          for (const action of actions) {
            const value = enabled ? action.delegatable || values.some(g => g.module === module && g.action === action.action && g.enabled) : false
            if (value || configuration.grants.some(g => g.module === module && g.action === action.action)) next.push({ module, action: action.action, enabled: value })
          }
          change(next)
        }} />
    })}
    <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background py-3">
      <Button type="button" variant="outline" disabled={authority.isSaving} onClick={() => { setDraft(null); void authority.refresh() }}>Bỏ thay đổi và tải lại</Button>
      <Button type="button" disabled={!dirty || disabled || unknown.length > 0 || unheld.length > 0} onClick={() => { void save() }}>
        {authority.isSaving ? 'Đang lưu…' : 'Lưu quyền bổ sung'}
      </Button>
    </div>
  </div>
}
