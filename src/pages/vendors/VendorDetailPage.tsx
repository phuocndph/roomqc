import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVendor } from '@/hooks/useVendors';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import {
  Edit, Mail, Phone, FileText, Star, MapPin, Globe, User,
  Building, CreditCard, Package, TrendingUp
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: vendor, isLoading } = useVendor(id!);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!vendor) {
    return <div className="text-center py-12">Không tìm thấy nhà cung cấp</div>;
  }

  const getCategoryBadge = () => {
    const variants: Record<string, any> = {
      supplier: { label: 'Nhà cung cấp', variant: 'default' },
      service_provider: { label: 'Dịch vụ', variant: 'secondary' },
      contractor: { label: 'Thầu phụ', variant: 'outline' }
    };
    return variants[vendor.category];
  };

  const getStatusBadge = () => {
    const variants: Record<string, any> = {
      active: { label: 'Hoạt động', variant: 'default' },
      inactive: { label: 'Không hoạt động', variant: 'secondary' },
      suspended: { label: 'Tạm ngưng', variant: 'destructive' }
    };
    return variants[vendor.status];
  };

  const categoryBadge = getCategoryBadge();
  const statusBadge = getStatusBadge();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <Avatar className="w-20 h-20">
                <AvatarImage src={vendor.logo_url} />
                <AvatarFallback className="text-2xl">
                  {vendor.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div>
                <h1 className="text-2xl font-bold">{vendor.name}</h1>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm text-muted-foreground">
                    {vendor.code}
                  </span>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium">{vendor.rating.toFixed(1)}/5.0</span>
                    <span className="text-sm text-muted-foreground">
                      (từ {vendor.total_orders} đánh giá)
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Badge variant={categoryBadge.variant}>
                    {categoryBadge.label}
                  </Badge>
                  <Badge variant={statusBadge.variant}>
                    {statusBadge.label}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate(`/vendors/${id}/edit`)}
              >
                <Edit className="w-4 h-4 mr-2" />
                Sửa
              </Button>
              <Button 
                size="sm"
                onClick={() => navigate(`/purchase-orders/new?vendor=${id}`)}
              >
                <FileText className="w-4 h-4 mr-2" />
                Tạo đơn
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Phone className="w-4 h-4" />
                LIÊN HỆ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">{vendor.address}</div>
                  {vendor.city && (
                    <div className="text-muted-foreground">{vendor.city}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{vendor.phone}</span>
              </div>

              {vendor.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{vendor.email}</span>
                </div>
              )}

              {vendor.website && (
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{vendor.website}</span>
                </div>
              )}

              <div className="pt-3 border-t">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{vendor.contact_person}</div>
                    {vendor.contact_position && (
                      <div className="text-xs text-muted-foreground">
                        {vendor.contact_position}
                      </div>
                    )}
                  </div>
                </div>
                {vendor.contact_phone && (
                  <div className="flex items-center gap-2 mt-2 ml-6">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm">{vendor.contact_phone}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payment Terms */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />
                ĐIỀU KHOẢN
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Thanh toán:</span>
                <span className="font-medium">{vendor.payment_terms}</span>
              </div>
              {vendor.delivery_time && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Giao hàng:</span>
                  <span className="font-medium">{vendor.delivery_time}</span>
                </div>
              )}
              {vendor.minimum_order_value && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Đơn TT:</span>
                  <span className="font-medium">
                    {formatCurrency(vendor.minimum_order_value)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                HIỆU SUẤT
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tổng đơn:</span>
                <span className="font-semibold">{vendor.total_orders}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tổng GT:</span>
                <span className="font-semibold">
                  {formatCurrency(vendor.total_value)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">TB/đơn:</span>
                <span className="font-semibold">
                  {formatCurrency(vendor.total_value / vendor.total_orders || 0)}
                </span>
              </div>
              
              <div className="pt-3 border-t">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rating:</span>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold">
                      {vendor.rating.toFixed(1)}/5
                    </span>
                  </div>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-muted-foreground">On-time:</span>
                  <span className="font-semibold">
                    {vendor.on_time_delivery_rate}% ✓
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">Tổng quan</TabsTrigger>
              <TabsTrigger value="orders">Đơn hàng</TabsTrigger>
              <TabsTrigger value="documents">Tài liệu</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Sản phẩm & Dịch vụ</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {vendor.products_services.map((item, index) => (
                      <Badge key={index} variant="secondary">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {vendor.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle>Ghi chú</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {vendor.notes}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="orders">
              <Card>
                <CardHeader>
                  <CardTitle>Lịch sử đơn hàng</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Chưa có đơn hàng nào
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents">
              <Card>
                <CardHeader>
                  <CardTitle>Tài liệu</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Chưa có tài liệu nào
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
