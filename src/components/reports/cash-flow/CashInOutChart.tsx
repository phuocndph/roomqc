import { useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import type { CashFlowDayPoint } from '@/hooks/useCashFlowReport'

interface Props {
  data: CashFlowDayPoint[]
  loading?: boolean
}

const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

const fmtDay = (s: string) => {
  const [, m, d] = s.split('-')
  return `${d}/${m}`
}

export function CashInOutChart({ data, loading }: Props) {
  const series = useMemo(() => {
    let cum = 0
    return data.map((d) => {
      cum += d.net
      return { ...d, cumNet: cum }
    })
  }, [data])

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="text-sm font-medium">Dòng tiền theo ngày</div>
        <Skeleton className="h-[260px] w-full" />
      </div>
    )
  }
  if (!data.length) {
    return (
      <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
        Chưa có giao dịch trong kỳ này.
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Dòng tiền theo ngày</h3>
        <span className="text-[11px] text-muted-foreground">
          Tiền vào / Tiền ra theo ngày + Net cash dồn
        </span>
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} width={60} />
            <Tooltip
              formatter={(v: number) => formatCurrency(v)}
              labelFormatter={(l) => `Ngày ${fmtDay(String(l))}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="inflow" name="Tiền vào" fill="hsl(142 76% 45%)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="outflow" name="Tiền ra" fill="hsl(0 72% 55%)" radius={[2, 2, 0, 0]} />
            <Line
              type="monotone"
              dataKey="cumNet"
              name="Net cash dồn"
              stroke="hsl(220 80% 50%)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
