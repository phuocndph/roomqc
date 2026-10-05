import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Plus, Pause, Trophy, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CreateABTestDialog } from './CreateABTestDialog';

interface DBABTest {
  id: string;
  name: string;
  status: string;
  variant_a_subject: string;
  variant_b_subject: string;
  sent_a: number;
  sent_b: number;
  opened_a: number;
  opened_b: number;
  winner: string | null;
  created_at: string;
  updated_at: string;
}

interface ABTest {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'completed';
  variantA: {
    name: string;
    subject: string;
    sent: number;
    opened: number;
    clicked: number;
  };
  variantB: {
    name: string;
    subject: string;
    sent: number;
    opened: number;
    clicked: number;
  };
  startedAt?: string;
  completedAt?: string;
}

function mapDBToUI(row: DBABTest): ABTest {
  return {
    id: row.id,
    name: row.name,
    status: row.status as ABTest['status'],
    variantA: {
      name: 'Variant A',
      subject: row.variant_a_subject,
      sent: row.sent_a ?? 0,
      opened: row.opened_a ?? 0,
      clicked: 0,
    },
    variantB: {
      name: 'Variant B',
      subject: row.variant_b_subject,
      sent: row.sent_b ?? 0,
      opened: row.opened_b ?? 0,
      clicked: 0,
    },
    startedAt: new Date(row.created_at).toLocaleDateString('vi-VN'),
    completedAt: row.status === 'completed' ? new Date(row.updated_at).toLocaleDateString('vi-VN') : undefined,
  };
}

function useABTests() {
  return useQuery<ABTest[]>({
    queryKey: ['ab-tests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ab_tests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as DBABTest[]).map(mapDBToUI);
    },
  });
}

export function ABTestingManager() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data: tests, isLoading, error } = useABTests();

  const calculateRate = (opened: number, sent: number) => {
    return sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0';
  };

  const getWinner = (test: ABTest) => {
    const openRateA = parseFloat(calculateRate(test.variantA.opened, test.variantA.sent));
    const openRateB = parseFloat(calculateRate(test.variantB.opened, test.variantB.sent));
    if (openRateA > openRateB) return 'A';
    if (openRateB > openRateA) return 'B';
    return 'tie';
  };

  const formatStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Bản nháp';
      case 'running': return 'Đang chạy';
      case 'completed': return 'Hoàn thành';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">A/B Testing</h2>
          <p className="text-muted-foreground">So sánh các phiên bản để tối ưu hiệu suất</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Tạo A/B Test
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border p-4 text-center text-sm text-red-600">
          Lỗi tải danh sách A/B test: {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {/* Tests List */}
      {!isLoading && !error && (
        <div className="space-y-4">
          {(!tests || tests.length === 0) ? (
            <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
              Chưa có A/B test nào. Nhấn "Tạo A/B Test" để bắt đầu.
            </div>
          ) : (
            tests.map((test) => {
              const winner = getWinner(test);
              return (
                <Card key={test.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{test.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge
                            variant={
                              test.status === 'running'
                                ? 'default'
                                : test.status === 'completed'
                                  ? 'secondary'
                                  : 'outline'
                            }
                          >
                            {formatStatusLabel(test.status)}
                          </Badge>
                          {test.status === 'completed' && winner !== 'tie' && (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                              <Trophy className="h-3 w-3 mr-1" />
                              Chiến thắng: Variant {winner}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {test.status === 'running' && (
                        <Button variant="outline" size="sm">
                          <Pause className="h-4 w-4 mr-2" />
                          Tạm dừng
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Variant A */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium flex items-center gap-2">
                            {test.variantA.name}
                            {winner === 'A' && <Trophy className="h-4 w-4 text-yellow-600" />}
                          </h4>
                          <span className="text-sm text-muted-foreground">
                            Tỷ lệ mở: {calculateRate(test.variantA.opened, test.variantA.sent)}%
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{test.variantA.subject}</p>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-2xl font-bold">{test.variantA.sent}</p>
                            <p className="text-xs text-muted-foreground">Đã gửi</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-blue-600">{test.variantA.opened}</p>
                            <p className="text-xs text-muted-foreground">Đã mở</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-green-600">{test.variantA.clicked}</p>
                            <p className="text-xs text-muted-foreground">Đã click</p>
                          </div>
                        </div>
                        <Progress
                          value={parseFloat(calculateRate(test.variantA.opened, test.variantA.sent))}
                          className="mt-2"
                        />
                      </div>

                      <div className="border-t pt-6">
                        {/* Variant B */}
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium flex items-center gap-2">
                            {test.variantB.name}
                            {winner === 'B' && <Trophy className="h-4 w-4 text-yellow-600" />}
                          </h4>
                          <span className="text-sm text-muted-foreground">
                            Tỷ lệ mở: {calculateRate(test.variantB.opened, test.variantB.sent)}%
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{test.variantB.subject}</p>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-2xl font-bold">{test.variantB.sent}</p>
                            <p className="text-xs text-muted-foreground">Đã gửi</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-blue-600">{test.variantB.opened}</p>
                            <p className="text-xs text-muted-foreground">Đã mở</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-green-600">{test.variantB.clicked}</p>
                            <p className="text-xs text-muted-foreground">Đã click</p>
                          </div>
                        </div>
                        <Progress
                          value={parseFloat(calculateRate(test.variantB.opened, test.variantB.sent))}
                          className="mt-2"
                        />
                      </div>

                      {/* Test Info */}
                      <div className="flex items-center justify-between text-sm text-muted-foreground pt-4 border-t">
                        <span>Tạo: {test.startedAt}</span>
                        {test.completedAt && <span>Hoàn thành: {test.completedAt}</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      <CreateABTestDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
  );
}
