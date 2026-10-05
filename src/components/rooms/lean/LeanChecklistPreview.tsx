interface Props {
  groups: { key: string; label: string; count?: number }[]
}

/**
 * Lean Checklist Preview — chỉ hiện NHÓM, không hiện từng item.
 * Mục đích: cho user biết sắp kiểm gì, không bắt đọc dài.
 */
export function LeanChecklistPreview({ groups }: Props) {
  if (!groups.length) return null
  return (
    <section
      aria-label="Sẽ kiểm các nhóm"
      className="border rounded-lg p-4 space-y-3"
    >
      <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        Sẽ kiểm các nhóm
      </div>
      <ul className="space-y-2.5">
        {groups.map((g) => (
          <li
            key={g.key}
            className="flex items-center justify-between text-[18px]"
            style={{ minHeight: 32 }}
          >
            <span className="text-foreground">{g.label}</span>
            {typeof g.count === 'number' && g.count > 0 && (
              <span className="text-[16px] text-muted-foreground tabular-nums">
                {g.count} món
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
