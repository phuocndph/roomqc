import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Smartphone, Monitor } from "lucide-react";

interface InstallGuideSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Platform = 'ios' | 'android' | 'desktop';

const getPlatform = (): Platform => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
};

// iOS Share Icon Illustration
const IOSShareIcon = () => (
  <svg viewBox="0 0 120 100" className="w-full h-24">
    {/* Safari browser bar */}
    <rect x="10" y="10" width="100" height="80" rx="8" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="2" />
    <rect x="10" y="10" width="100" height="20" rx="8" fill="hsl(var(--card))" />
    <rect x="10" y="22" width="100" height="8" fill="hsl(var(--card))" />
    
    {/* URL bar */}
    <rect x="20" y="14" width="60" height="12" rx="4" fill="hsl(var(--muted))" />
    
    {/* Bottom toolbar */}
    <rect x="10" y="70" width="100" height="20" fill="hsl(var(--card))" />
    
    {/* Share button - highlighted */}
    <g className="animate-pulse">
      <rect x="50" y="74" width="20" height="12" rx="2" fill="hsl(var(--primary))" />
      {/* Share icon */}
      <path d="M60 77 L60 82" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M57 79 L60 76 L63 79" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="55" y="80" width="10" height="4" rx="1" fill="none" stroke="white" strokeWidth="1" />
    </g>
    
    {/* Arrow pointing to share button */}
    <path d="M60 95 L60 88" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" markerEnd="url(#arrowhead)" />
    <polygon points="57,90 60,86 63,90" fill="hsl(var(--primary))" />
  </svg>
);

// iOS Menu Illustration
const IOSMenuIllustration = () => (
  <svg viewBox="0 0 120 120" className="w-full h-28">
    {/* Share sheet background */}
    <rect x="10" y="10" width="100" height="100" rx="12" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="2" />
    
    {/* Menu items */}
    <rect x="18" y="20" width="84" height="14" rx="4" fill="hsl(var(--muted))" />
    <rect x="18" y="40" width="84" height="14" rx="4" fill="hsl(var(--muted))" />
    
    {/* Add to Home Screen - highlighted */}
    <g className="animate-pulse">
      <rect x="18" y="60" width="84" height="14" rx="4" fill="hsl(var(--primary))" />
      <text x="60" y="70" textAnchor="middle" fill="white" fontSize="7" fontWeight="500">Thêm vào màn hình chính</text>
    </g>
    
    <rect x="18" y="80" width="84" height="14" rx="4" fill="hsl(var(--muted))" />
    
    {/* Plus icon indicator */}
    <rect x="22" y="63" width="8" height="8" rx="2" fill="white" opacity="0.3" />
    <path d="M26 65 L26 69 M24 67 L28 67" stroke="white" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

// iOS Confirm Illustration
const IOSConfirmIllustration = () => (
  <svg viewBox="0 0 120 80" className="w-full h-20">
    {/* Dialog box */}
    <rect x="10" y="10" width="100" height="60" rx="10" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="2" />
    
    {/* Title */}
    <text x="60" y="28" textAnchor="middle" fill="hsl(var(--foreground))" fontSize="7" fontWeight="600">Thêm vào màn hình chính?</text>
    
    {/* Buttons */}
    <rect x="18" y="40" width="35" height="20" rx="6" fill="hsl(var(--muted))" />
    <text x="35" y="53" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="6">Huỷ</text>
    
    {/* Add button - highlighted */}
    <g className="animate-pulse">
      <rect x="67" y="40" width="35" height="20" rx="6" fill="hsl(var(--primary))" />
      <text x="84" y="53" textAnchor="middle" fill="white" fontSize="6" fontWeight="600">Thêm</text>
    </g>
  </svg>
);

// Android Menu Icon Illustration
const AndroidMenuIcon = () => (
  <svg viewBox="0 0 120 100" className="w-full h-24">
    {/* Chrome browser */}
    <rect x="10" y="10" width="100" height="80" rx="4" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="2" />
    
    {/* URL bar area */}
    <rect x="10" y="10" width="100" height="24" fill="hsl(var(--card))" />
    <rect x="16" y="16" width="60" height="12" rx="6" fill="hsl(var(--muted))" />
    
    {/* Three dots menu - highlighted */}
    <g className="animate-pulse">
      <circle cx="95" cy="22" r="8" fill="hsl(var(--primary))" opacity="0.2" />
      <circle cx="95" cy="18" r="1.5" fill="hsl(var(--primary))" />
      <circle cx="95" cy="22" r="1.5" fill="hsl(var(--primary))" />
      <circle cx="95" cy="26" r="1.5" fill="hsl(var(--primary))" />
    </g>
    
    {/* Arrow pointing to menu */}
    <path d="M95 95 L95 40" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 2" />
    <polygon points="92,42 95,36 98,42" fill="hsl(var(--primary))" />
  </svg>
);

// Android Menu Illustration
const AndroidMenuIllustration = () => (
  <svg viewBox="0 0 120 130" className="w-full h-32">
    {/* Dropdown menu */}
    <rect x="30" y="10" width="80" height="110" rx="4" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="2" />
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.2" />
    </filter>
    <rect x="30" y="10" width="80" height="110" rx="4" fill="hsl(var(--card))" filter="url(#shadow)" />
    
    {/* Menu items */}
    <rect x="38" y="20" width="64" height="12" rx="2" fill="hsl(var(--muted))" />
    <rect x="38" y="38" width="64" height="12" rx="2" fill="hsl(var(--muted))" />
    <rect x="38" y="56" width="64" height="12" rx="2" fill="hsl(var(--muted))" />
    
    {/* Add to Home Screen - highlighted */}
    <g className="animate-pulse">
      <rect x="38" y="74" width="64" height="12" rx="2" fill="hsl(var(--primary))" />
      <text x="70" y="82" textAnchor="middle" fill="white" fontSize="5" fontWeight="500">Thêm vào màn hình chính</text>
    </g>
    
    {/* Install app option */}
    <rect x="38" y="92" width="64" height="12" rx="2" fill="hsl(var(--primary))" opacity="0.6" />
    <text x="70" y="100" textAnchor="middle" fill="white" fontSize="5">Cài đặt ứng dụng</text>
    
    {/* Icon */}
    <rect x="40" y="76" width="8" height="8" rx="1" fill="white" opacity="0.3" />
    <path d="M44 78 L44 82 M42 80 L46 80" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
  </svg>
);

// Android Confirm Illustration
const AndroidConfirmIllustration = () => (
  <svg viewBox="0 0 120 90" className="w-full h-22">
    {/* Dialog background */}
    <rect x="10" y="10" width="100" height="70" rx="8" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="2" />
    
    {/* App icon placeholder */}
    <rect x="20" y="20" width="24" height="24" rx="6" fill="hsl(var(--primary))" opacity="0.2" />
    <text x="32" y="35" textAnchor="middle" fill="hsl(var(--primary))" fontSize="10">📱</text>
    
    {/* App name */}
    <text x="52" y="28" fill="hsl(var(--foreground))" fontSize="6" fontWeight="600">RoomQc</text>
    <text x="52" y="38" fill="hsl(var(--muted-foreground))" fontSize="5">roomweave.app</text>
    
    {/* Buttons */}
    <rect x="18" y="52" width="30" height="18" rx="4" fill="hsl(var(--muted))" />
    <text x="33" y="64" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="5">Huỷ</text>
    
    {/* Install button - highlighted */}
    <g className="animate-pulse">
      <rect x="72" y="52" width="30" height="18" rx="4" fill="hsl(var(--primary))" />
      <text x="87" y="64" textAnchor="middle" fill="white" fontSize="5" fontWeight="600">Cài đặt</text>
    </g>
  </svg>
);

// Desktop Illustration
const DesktopIllustration = () => (
  <svg viewBox="0 0 120 80" className="w-full h-20">
    {/* Browser window */}
    <rect x="10" y="10" width="100" height="60" rx="4" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="2" />
    <rect x="10" y="10" width="100" height="16" fill="hsl(var(--card))" />
    
    {/* URL bar with install icon */}
    <rect x="16" y="14" width="50" height="8" rx="4" fill="hsl(var(--muted))" />
    
    {/* Install icon in address bar - highlighted */}
    <g className="animate-pulse">
      <circle cx="90" cy="18" r="6" fill="hsl(var(--primary))" opacity="0.2" />
      <path d="M90 15 L90 21 M87 18 L90 21 L93 18" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  </svg>
);

const iosSteps = [
  {
    step: 1,
    title: "Nhấn vào icon Share",
    description: "Tìm icon chia sẻ ở thanh công cụ phía dưới Safari",
    illustration: <IOSShareIcon />,
  },
  {
    step: 2,
    title: "Chọn 'Thêm vào màn hình chính'",
    description: "Cuộn xuống trong menu và nhấn vào tùy chọn này",
    illustration: <IOSMenuIllustration />,
  },
  {
    step: 3,
    title: "Xác nhận thêm",
    description: "Nhấn 'Thêm' ở góc trên phải để hoàn tất cài đặt",
    illustration: <IOSConfirmIllustration />,
  },
];

const androidSteps = [
  {
    step: 1,
    title: "Nhấn vào menu trình duyệt",
    description: "Tìm icon ba chấm (⋮) ở góc trên phải Chrome",
    illustration: <AndroidMenuIcon />,
  },
  {
    step: 2,
    title: "Chọn 'Thêm vào màn hình chính'",
    description: "Hoặc 'Cài đặt ứng dụng' nếu có hiển thị",
    illustration: <AndroidMenuIllustration />,
  },
  {
    step: 3,
    title: "Xác nhận cài đặt",
    description: "Nhấn 'Cài đặt' hoặc 'Thêm' để hoàn tất",
    illustration: <AndroidConfirmIllustration />,
  },
];

const desktopSteps = [
  {
    step: 1,
    title: "Tìm icon cài đặt",
    description: "Nhấn vào icon cài đặt (⊕) trong thanh địa chỉ trình duyệt",
    illustration: <DesktopIllustration />,
  },
  {
    step: 2,
    title: "Xác nhận cài đặt",
    description: "Nhấn 'Cài đặt' trong hộp thoại xuất hiện",
    illustration: <AndroidConfirmIllustration />,
  },
];

const platformInfo: Record<Platform, { name: string; icon: React.ReactNode; steps: typeof iosSteps }> = {
  ios: {
    name: 'iOS Safari',
    icon: <Smartphone className="h-4 w-4" />,
    steps: iosSteps,
  },
  android: {
    name: 'Android Chrome',
    icon: <Smartphone className="h-4 w-4" />,
    steps: androidSteps,
  },
  desktop: {
    name: 'Desktop',
    icon: <Monitor className="h-4 w-4" />,
    steps: desktopSteps,
  },
};

export const InstallGuideSheet = ({ open, onOpenChange }: InstallGuideSheetProps) => {
  const platform = getPlatform();
  const { name, icon, steps } = platformInfo[platform];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
        <SheetHeader className="text-left pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-lg font-semibold">Cài đặt ứng dụng</div>
              <div className="text-sm font-normal text-muted-foreground">
                Thêm vào màn hình chính để truy cập nhanh
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto h-[calc(85vh-180px)] py-4">
          {/* Platform indicator */}
          <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg mb-6">
            {icon}
            <span className="text-sm text-muted-foreground">
              Bạn đang dùng: <span className="font-medium text-foreground">{name}</span>
            </span>
          </div>

          {/* Steps */}
          <div className="space-y-6">
            {steps.map((step) => (
              <div key={step.step} className="relative">
                {/* Step number */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                    {step.step}
                  </div>
                  <div className="flex-1 pt-1">
                    <h3 className="font-medium text-foreground mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
                    
                    {/* Illustration */}
                    <div className="bg-muted/50 rounded-xl p-4 border">
                      {step.illustration}
                    </div>
                  </div>
                </div>

                {/* Connector line */}
                {step.step < steps.length && (
                  <div className="absolute left-4 top-10 w-0.5 h-[calc(100%-20px)] bg-border -translate-x-1/2" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t">
          <Button 
            className="w-full" 
            size="lg"
            onClick={() => onOpenChange(false)}
          >
            Đã hiểu
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
