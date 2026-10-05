import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantUsage } from "@/hooks/useTenantUsage";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function UsageTrendCharts() {
  const { data: usage } = useTenantUsage();

  if (!usage) {
    return null;
  }

  // Mock data - trong thực tế sẽ cần endpoint để lấy historical data
  const generateMockTrendData = () => {
    const months = ["T1", "T2", "T3", "T4", "T5", "T6"];
    return months.map((month, index) => ({
      month,
      hotels: Math.floor((usage.current_hotels_count || 0) * (0.5 + (index * 0.1))),
      users: Math.floor((usage.current_users_count || 0) * (0.4 + (index * 0.15))),
      rooms: Math.floor((usage.current_rooms_count || 0) * (0.6 + (index * 0.08))),
      items: Math.floor((usage.current_items_count || 0) * (0.3 + (index * 0.12))),
    }));
  };

  const generateStorageTrendData = () => {
    const months = ["T1", "T2", "T3", "T4", "T5", "T6"];
    const currentGB = usage.current_storage_bytes / (1024 ** 3);
    return months.map((month, index) => ({
      month,
      storage: Number((currentGB * (0.3 + (index * 0.15))).toFixed(2)),
    }));
  };

  const trendData = generateMockTrendData();
  const storageTrendData = generateStorageTrendData();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Xu hướng sử dụng</CardTitle>
        <CardDescription>
          Biểu đồ xu hướng sử dụng tài nguyên trong 6 tháng qua
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="resources" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="resources">Tài nguyên</TabsTrigger>
            <TabsTrigger value="storage">Lưu trữ</TabsTrigger>
          </TabsList>

          <TabsContent value="resources" className="space-y-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="month" 
                    className="text-xs"
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis 
                    className="text-xs"
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="hotels" 
                    stroke="hsl(var(--chart-1))" 
                    strokeWidth={2}
                    name="Khách sạn"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="users" 
                    stroke="hsl(var(--chart-2))" 
                    strokeWidth={2}
                    name="Người dùng"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="rooms" 
                    stroke="hsl(var(--chart-3))" 
                    strokeWidth={2}
                    name="Phòng"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="items" 
                    stroke="hsl(var(--chart-4))" 
                    strokeWidth={2}
                    name="Sản phẩm"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="storage" className="space-y-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={storageTrendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="month" 
                    className="text-xs"
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis 
                    className="text-xs"
                    stroke="hsl(var(--muted-foreground))"
                    label={{ 
                      value: 'GB', 
                      angle: -90, 
                      position: 'insideLeft',
                      style: { fill: 'hsl(var(--muted-foreground))' }
                    }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                    formatter={(value: number) => [`${value} GB`, "Lưu trữ"]}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="storage" 
                    stroke="hsl(var(--chart-5))" 
                    strokeWidth={2}
                    name="Dung lượng (GB)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Lưu ý:</strong> Biểu đồ xu hướng hiển thị dữ liệu mô phỏng. 
            Dữ liệu thực tế sẽ được cập nhật khi tích hợp với hệ thống tracking lịch sử.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
