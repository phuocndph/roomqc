import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useVendors } from '@/hooks/useVendors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Star, TrendingUp, CheckCircle, AlertCircle, FileDown } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { navigateBack } from '@/lib/navigation';

const VendorComparison: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const vendorIds = searchParams.get('ids')?.split(',') || [];

  const { data: allVendors } = useVendors({});
  const vendors = allVendors?.filter(v => vendorIds.includes(v.id)) || [];

  if (vendors.length < 2) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Vui lòng chọn từ 2 đến 5 nhà cung cấp để so sánh
        </p>
      </div>
    );
  }

  const calculateScore = (vendor: any) => {
    const priceScore = 30;
    const qualityScore = (vendor.rating / 5) * 20;
    const deliveryScore = (vendor.on_time_delivery_rate / 100) * 20;
    const serviceScore = (vendor.rating / 5) * 15;
    const termsScore = 15;

    return Math.round(priceScore + qualityScore + deliveryScore + serviceScore + termsScore);
  };

  const scores = vendors.map(v => ({ vendor: v, score: calculateScore(v) }));
  scores.sort((a, b) => b.score - a.score);

  const getBestValue = (field: string) => {
    switch (field) {
      case 'rating':
        return Math.max(...vendors.map(v => v.rating));
      case 'on_time':
        return Math.max(...vendors.map(v => v.on_time_delivery_rate));
      case 'payment_terms':
        return Math.min(
          ...vendors.map(v => parseInt(v.payment_terms.match(/\d+/)?.[0] || '30'))
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">So sánh nhà cung cấp</h1>
          <p className="text-muted-foreground mt-1">
            So sánh {vendors.length} nhà cung cấp
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <FileDown className="w-4 h-4 mr-2" />
            Xuất PDF
          </Button>
          <Button variant="outline" onClick={() => navigateBack(navigate, '/laundry/vendors')}>
            Thay đổi lựa chọn
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4" style={{ gridTemplateColumns: `200px repeat(${vendors.length}, 1fr)` }}>
            <div className="font-semibold">Nhà cung cấp</div>
            {vendors.map(vendor => (
              <div key={vendor.id} className="text-center">
                <Avatar className="w-16 h-16 mx-auto mb-2">
                  <AvatarImage src={vendor.logo_url} />
                  <AvatarFallback>
                    {vendor.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="font-semibold">{vendor.name}</div>
                <div className="text-xs text-muted-foreground">{vendor.code}</div>
                <Badge variant="outline" className="mt-2">
                  {vendor.category === 'supplier' ? 'Nhà cung cấp' :
                   vendor.category === 'service_provider' ? 'Dịch vụ' : 'Thầu phụ'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hiệu suất</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium w-48">Rating</TableCell>
                  {vendors.map(vendor => {
                    const isBest = vendor.rating === getBestValue('rating');
                    return (
                      <TableCell key={vendor.id}>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-semibold">{vendor.rating.toFixed(1)}/5</span>
                          </div>
                          {isBest && <CheckCircle className="w-4 h-4 text-green-600" />}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
  
                <TableRow>
                  <TableCell className="font-medium">Tổng đơn</TableCell>
                  {vendors.map(vendor => (
                    <TableCell key={vendor.id}>
                      <span className="font-semibold">{vendor.total_orders}</span>
                    </TableCell>
                  ))}
                </TableRow>
  
                <TableRow>
                  <TableCell className="font-medium">Tổng GT</TableCell>
                  {vendors.map(vendor => (
                    <TableCell key={vendor.id}>
                      <span className="font-semibold">
                        {formatCurrency(vendor.total_value)}
                      </span>
                    </TableCell>
                  ))}
                </TableRow>
  
                <TableRow>
                  <TableCell className="font-medium">On-time</TableCell>
                  {vendors.map(vendor => {
                    const isBest = vendor.on_time_delivery_rate === getBestValue('on_time');
                    return (
                      <TableCell key={vendor.id}>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold">
                                {vendor.on_time_delivery_rate}%
                              </span>
                              {isBest && <CheckCircle className="w-4 h-4 text-green-600" />}
                            </div>
                            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  vendor.on_time_delivery_rate >= 95
                                    ? 'bg-green-500'
                                    : vendor.on_time_delivery_rate >= 90
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                                }`}
                                style={{ width: `${vendor.on_time_delivery_rate}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tổng điểm</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${vendors.length}, 1fr)` }}>
            {scores.map((item, index) => (
              <div key={item.vendor.id} className="text-center p-6 border rounded-lg">
                {index === 0 && <div className="text-4xl mb-2">🥇</div>}
                {index === 1 && <div className="text-4xl mb-2">🥈</div>}
                {index === 2 && <div className="text-4xl mb-2">🥉</div>}
                <div className="text-3xl font-bold text-primary mb-2">
                  {item.score}/100
                </div>
                <div className="font-medium">{item.vendor.name}</div>

                <div className="mt-4 space-y-2 text-sm text-left">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Giá:</span>
                    <span>30/30</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Chất lượng:</span>
                    <span>{Math.round((item.vendor.rating / 5) * 20)}/20</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Giao hàng:</span>
                    <span>
                      {Math.round((item.vendor.on_time_delivery_rate / 100) * 20)}/20
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dịch vụ:</span>
                    <span>{Math.round((item.vendor.rating / 5) * 15)}/15</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Điều khoản:</span>
                    <span>15/15</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Đề xuất
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-primary/5 rounded-lg">
              <h3 className="font-semibold text-lg mb-2">
                {scores[0].vendor.name} là lựa chọn tốt nhất với:
              </h3>
              <ul className="space-y-2">
                {scores[0].vendor.rating >= 4.5 && (
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span>Rating cao nhất ({scores[0].vendor.rating.toFixed(1)}/5)</span>
                  </li>
                )}
                {scores[0].vendor.on_time_delivery_rate >= 95 && (
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span>
                      On-time delivery tốt nhất ({scores[0].vendor.on_time_delivery_rate}%)
                    </span>
                  </li>
                )}
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Tổng điểm cao nhất ({scores[0].score}/100)</span>
                </li>
              </ul>
            </div>

            {scores.length > 1 && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>{scores[1].vendor.name}</strong> cũng là lựa chọn tốt nếu bạn ưu tiên
                  các yếu tố khác. Có thể xem xét đàm phán điều khoản tốt hơn hoặc so sánh giá
                  cụ thể cho từng sản phẩm.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorComparison;
