import { useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useToast } from '@/hooks/use-toast';
import { InstallGuideSheet } from './InstallGuideSheet';

export const InstallPWA = () => {
  const { canInstall, installPWA, isInstalled } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const { toast } = useToast();

  const handleInstall = async () => {
    if (canInstall) {
      const success = await installPWA();
      
      if (success) {
        toast({
          title: "Cài đặt thành công!",
          description: "Ứng dụng đã được thêm vào màn hình chính.",
        });
        setDismissed(true);
      } else {
        toast({
          title: "Không thể cài đặt",
          description: "Vui lòng làm theo hướng dẫn thủ công.",
          variant: "destructive",
        });
        setShowGuide(true);
      }
    } else {
      // Show manual installation guide for iOS/Safari
      setShowGuide(true);
    }
  };

  // Only hide if already installed or dismissed
  if (isInstalled || dismissed) {
    return null;
  }

  return (
    <>
      <Card className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 p-4 shadow-lg z-50 bg-card border-border">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1">Cài đặt RoomQc</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Thêm vào màn hình chính để truy cập nhanh và sử dụng offline
            </p>
            
            <div className="flex gap-2">
              <Button 
                size="sm" 
                onClick={handleInstall}
                className="flex-1"
              >
                <Download className="w-4 h-4 mr-1" />
                Cài đặt
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => setDismissed(true)}
              >
                Sau
              </Button>
            </div>
          </div>
          
          <Button
            size="icon"
            variant="ghost"
            className="flex-shrink-0 w-6 h-6"
            onClick={() => setDismissed(true)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* Installation Guide Sheet */}
      <InstallGuideSheet 
        open={showGuide} 
        onOpenChange={setShowGuide} 
      />
    </>
  );
};
