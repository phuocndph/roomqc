import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { History, Save, X, Pencil } from 'lucide-react'
import {
  POLICY_KEY_LABELS,
  useHotelPolicies,
  useUpdateHotelPolicy,
  type HotelPolicy,
} from '@/hooks/useHotelPolicy'
import { useHotelContext } from '@/contexts/HotelContext'
import { HotelPolicyHistoryDrawer } from '@/components/settings/HotelPolicyHistoryDrawer'

export default function HotelPolicyPage() {
  const { selectedHotel } = useHotelContext()
  const { data: policies, isLoading } = useHotelPolicies()
  const [historyKey, setHistoryKey] = useState<string | undefined>()

  if (!selectedHotel) {
    return (
      <div className="space-y-4">
        <PageHeader title="Cấu hình khách sạn" />
        <div className="border rounded-lg p-6 text-sm text-muted-foreground text-center">
          Vui lòng chọn 1 khách sạn cụ thể từ thanh trên cùng.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cấu hình khách sạn"
        description={`Chính sách áp dụng cho: ${selectedHotel.name}. Mọi thay đổi đều được ghi lịch sử.`}
      />

      {isLoading && <p className="text-xs text-muted-foreground">Đang tải...</p>}

      <div className="space-y-2">
        {policies?.map((p) => (
          <PolicyRow
            key={p.id}
            policy={p}
            onShowHistory={() => setHistoryKey(p.policy_key)}
          />
        ))}
      </div>

      <HotelPolicyHistoryDrawer
        open={!!historyKey}
        onOpenChange={(o) => !o && setHistoryKey(undefined)}
        policyKey={historyKey}
      />
    </div>
  )
}

function PolicyRow({
  policy,
  onShowHistory,
}: {
  policy: HotelPolicy
  onShowHistory: () => void
}) {
  const update = useUpdateHotelPolicy()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(JSON.stringify(policy.policy_value, null, 2))
  const [parseError, setParseError] = useState<string | null>(null)

  const handleSave = () => {
    try {
      const parsed = JSON.parse(draft)
      setParseError(null)
      update.mutate(
        { id: policy.id, value: parsed },
        { onSuccess: () => setEditing(false) },
      )
    } catch (e: any) {
      setParseError('JSON không hợp lệ: ' + e.message)
    }
  }

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {POLICY_KEY_LABELS[policy.policy_key] ?? policy.policy_key}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {policy.policy_key} · v{policy.version}
          </p>
          {policy.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{policy.description}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={onShowHistory}
            className="h-8 px-2"
          >
            <History className="h-3.5 w-3.5" />
          </Button>
          {!editing ? (
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => setEditing(true)}
              className="h-8 px-2"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                type="button"
                onClick={handleSave}
                disabled={update.isPending}
                className="h-8 px-2"
              >
                <Save className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => {
                  setEditing(false)
                  setDraft(JSON.stringify(policy.policy_value, null, 2))
                  setParseError(null)
                }}
                className="h-8 px-2"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-xs min-h-[100px]"
          />
          {parseError && <p className="text-xs text-red-600">{parseError}</p>}
        </>
      ) : (
        <pre className="bg-muted p-2 rounded text-xs font-mono overflow-x-auto">
          {JSON.stringify(policy.policy_value, null, 2)}
        </pre>
      )}
    </div>
  )
}
