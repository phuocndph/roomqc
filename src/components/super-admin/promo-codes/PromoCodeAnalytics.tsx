import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

export function PromoCodeAnalytics() {
  const { data: usageData, isLoading } = useQuery({
    queryKey: ['promo-code-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promo_code_usage')
        .select(`
          *,
          promotional_codes(code, discount_type, discount_value)
        `)
        .order('used_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Process data for charts
      const usageByDate = data.reduce((acc: any, usage: any) => {
        const date = new Date(usage.used_at).toLocaleDateString();
        if (!acc[date]) {
          acc[date] = { date, count: 0, totalDiscount: 0 };
        }
        acc[date].count += 1;
        acc[date].totalDiscount += usage.discount_applied;
        return acc;
      }, {});

      const topCodes = data.reduce((acc: any, usage: any) => {
        const code = usage.promotional_codes?.code;
        if (!code) return acc;
        if (!acc[code]) {
          acc[code] = { code, uses: 0, totalDiscount: 0 };
        }
        acc[code].uses += 1;
        acc[code].totalDiscount += usage.discount_applied;
        return acc;
      }, {});

      return {
        usageByDate: Object.values(usageByDate),
        topCodes: Object.values(topCodes)
          .sort((a: any, b: any) => b.uses - a.uses)
          .slice(0, 10),
      };
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Usage Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={usageData?.usageByDate || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                name="Uses"
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="totalDiscount"
                stroke="hsl(142 76% 36%)"
                name="Discount ($)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Performing Codes */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Most Used Codes</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={usageData?.topCodes || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="code" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="uses" fill="hsl(var(--primary))" name="Uses" />
              <Bar dataKey="totalDiscount" fill="hsl(142 76% 36%)" name="Total Discount ($)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Code Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Code Performance Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Code</th>
                  <th className="text-right p-2">Uses</th>
                  <th className="text-right p-2">Total Discount</th>
                  <th className="text-right p-2">Avg Discount</th>
                </tr>
              </thead>
              <tbody>
                {usageData?.topCodes.map((code: any) => (
                  <tr key={code.code} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-mono font-bold">{code.code}</td>
                    <td className="text-right p-2">{code.uses}</td>
                    <td className="text-right p-2 text-green-600 font-semibold">
                      ${code.totalDiscount.toFixed(2)}
                    </td>
                    <td className="text-right p-2">
                      ${(code.totalDiscount / code.uses).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
