export function ControlResourceMeter({ label, percent, value, detail, stale = false }: {
  label: string; percent: number | null; value: string; detail?: string; stale?: boolean
}) {
  const known = percent !== null && Number.isFinite(percent) && percent >= 0 && percent <= 100
  const color = stale || !known ? 'bg-slate-400' : percent >= 90 ? 'bg-red-600' : percent >= 75 ? 'bg-amber-600' : 'bg-blue-600'
  return <div className="min-w-0 space-y-1.5">
    <dt className="text-sm font-medium">{label}</dt>
    <dd className="text-xl font-semibold tabular-nums leading-tight">{value}</dd>
    <div role={known ? 'meter' : undefined} aria-label={label} aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? 100 : undefined} aria-valuenow={known ? percent : undefined}
      aria-valuetext={known ? `${percent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% đã dùng${stale ? ' · Số đo đã cũ' : ''}` : undefined}
      className="h-2 overflow-hidden bg-slate-200 dark:bg-slate-800">
      {known && <div className={'h-full ' + color} style={{ width: percent + '%' }} />}
    </div>
    {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
  </div>
}
