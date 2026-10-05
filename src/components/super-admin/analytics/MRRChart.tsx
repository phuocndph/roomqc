import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useRevenueByMonth } from '@/hooks/useSuperAdminStats';

export function MRRChart() {
  const { data: revenue, isLoading } = useRevenueByMonth(6);

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!revenue || revenue.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No MRR data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={revenue}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis 
          dataKey="month" 
          className="text-xs text-muted-foreground"
        />
        <YAxis 
          className="text-xs text-muted-foreground"
          tickFormatter={(value) => `$${value.toLocaleString()}`}
        />
        <Tooltip 
          formatter={(value: number) => `$${value.toLocaleString()}`}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '0.5rem',
          }}
        />
        <Line 
          type="monotone" 
          dataKey="revenue" 
          stroke="hsl(var(--primary))" 
          strokeWidth={2}
          dot={{ fill: 'hsl(var(--primary))', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
