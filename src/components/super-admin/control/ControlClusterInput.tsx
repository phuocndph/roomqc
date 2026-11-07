import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { controlAdminClient, useControlAdmin } from '@/hooks/super-admin/useControlAdmin'

/** Native searchable suggestions; free text keeps every cluster reachable, including later pages. */
export function ControlClusterInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [focused, setFocused] = useState(false)
  const listId = useId()
  const clusters = useControlAdmin(['cluster-filter-suggestions'], (actor, options) => controlAdminClient.clusters(actor, {}, options), focused)
  return <>
    <Input id={id} list={listId} maxLength={40} value={value} placeholder="Chọn hoặc nhập mã cụm" onFocus={() => setFocused(true)}
      onChange={event => onChange(event.target.value)} aria-describedby={id + '-help'} />
    <datalist id={listId}>{clusters.data?.items.map(cluster => <option key={cluster.id} value={cluster.id} />)}</datalist>
    <p id={id + '-help'} className="text-xs text-muted-foreground">{clusters.message ? 'Không tải được gợi ý. Bạn vẫn có thể nhập mã cụm.'
      : clusters.data?.nextCursor ? 'Gợi ý một phần danh sách; có thể nhập mã cụm khác.' : 'Để trống để xem tất cả cụm.'}</p>
  </>
}
