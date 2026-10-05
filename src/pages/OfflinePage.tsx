import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

export const OfflinePage = () => {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (navigator.onLine) {
      setCountdown(2);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            navigate('/', { replace: true });
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [navigate]);

  const handleRetry = () => {
    if (navigator.onLine) {
      navigate('/');
      window.location.reload();
    } else {
      alert('Vẫn chưa có kết nối internet. Vui lòng kiểm tra lại.');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
          <WifiOff className="w-10 h-10 text-muted-foreground" />
        </div>

        <h1 className="text-2xl font-bold mb-3">Không có kết nối</h1>

        <p className="text-muted-foreground mb-6">
          Bạn đang offline. Một số tính năng có thể không khả dụng cho đến khi bạn kết nối lại internet.
        </p>

        {countdown !== null && (
          <p className="text-sm text-green-600 mb-4">
            Đã kết nối lại. Đang chuyển hướng sau {countdown} giây...
          </p>
        )}

        <div className="space-y-3">
          <Button onClick={handleRetry} className="w-full">
            <RefreshCw className="w-4 h-4 mr-2" />
            Thử lại
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="w-full"
          >
            Về Trang chủ
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          Một số trang đã truy cập gần đây có thể vẫn hiển thị được. Các chức năng cần kết nối mạng sẽ không hoạt động cho đến khi bạn online trở lại.
        </p>
      </Card>
    </div>
  );
};
