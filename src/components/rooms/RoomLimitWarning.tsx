import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Plus } from 'lucide-react';
import { useRoomSubscriptionLimit } from '@/hooks/useRoomSubscriptionLimit';
import { useState } from 'react';
import { AddRoomsDialog } from '@/components/settings/subscription/AddRoomsDialog';

interface RoomLimitWarningProps {
  variant?: 'inline' | 'banner';
}

export function RoomLimitWarning({ variant = 'inline' }: RoomLimitWarningProps) {
  const { registeredRooms, actualRooms, canCreateRoom, remainingSlots } = useRoomSubscriptionLimit();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Don't show if user can still create rooms
  if (canCreateRoom && remainingSlots > 5) return null;

  const isAtLimit = !canCreateRoom;
  const isNearLimit = remainingSlots > 0 && remainingSlots <= 5;

  if (variant === 'banner') {
    return (
      <>
        <Alert variant={isAtLimit ? 'destructive' : 'default'} className={isNearLimit ? 'border-yellow-500/50 bg-yellow-500/10' : ''}>
          <AlertTriangle className={`h-4 w-4 ${isNearLimit ? 'text-yellow-600' : ''}`} />
          <AlertTitle className={isNearLimit ? 'text-yellow-700' : ''}>
            {isAtLimit ? 'Đã đạt giới hạn phòng' : 'Sắp hết slot phòng'}
          </AlertTitle>
          <AlertDescription className={`flex flex-col sm:flex-row sm:items-center gap-2 ${isNearLimit ? 'text-yellow-700' : ''}`}>
            <span>
              {isAtLimit 
                ? `Bạn đã sử dụng ${actualRooms}/${registeredRooms} phòng đăng ký. Mua thêm để tiếp tục tạo phòng.`
                : `Còn ${remainingSlots} slot phòng (${actualRooms}/${registeredRooms}). Mua thêm sớm để không bị gián đoạn.`
              }
            </span>
            <Button 
              size="sm" 
              variant={isAtLimit ? 'default' : 'outline'}
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Mua thêm phòng
            </Button>
          </AlertDescription>
        </Alert>
        <AddRoomsDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  return (
    <>
      <div className={`p-3 rounded-lg text-sm ${isAtLimit ? 'bg-destructive/10 text-destructive' : 'bg-yellow-500/10 text-yellow-700'}`}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>
            {isAtLimit 
              ? `Không thể tạo phòng mới. Đã đạt giới hạn ${registeredRooms} phòng.`
              : `Còn ${remainingSlots} slot phòng.`
            }
          </span>
        </div>
        <Button 
          size="sm" 
          variant="link" 
          className={`p-0 h-auto ${isAtLimit ? 'text-destructive' : 'text-yellow-700'}`}
          onClick={() => setDialogOpen(true)}
        >
          Mua thêm phòng →
        </Button>
      </div>
      <AddRoomsDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
