import { Phone, Mail, MapPin, Building2, Clock, User, Send } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PRESENCE_DOT_COLOR, PRESENCE_LABEL, PRESENCE_TEXT_COLOR } from '@/lib/staffPresence'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { StaffActivityTimeline } from './StaffActivityTimeline'
import { useStaffActivities } from '@/hooks/useStaffActivity'
import type { StaffWithStatus } from '@/hooks/useStaffStatus'
import { getTelegramPhoneLink, formatPhoneForTelegram, openTelegramWithFallback, getTelegramDownloadLink } from '@/lib/phone-utils'
import { toast } from 'sonner'

interface StaffDetailSheetProps {
  staff: StaffWithStatus | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StaffDetailSheet({ staff, open, onOpenChange }: StaffDetailSheetProps) {
  const { data: activities, isLoading: loadingActivities } = useStaffActivities(staff?.id, 20)

  if (!staff) return null

  const initials = staff.full_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="sr-only">Chi tiết nhân viên</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {/* Header */}
          <div className="p-4 text-center">
            <Avatar className="h-20 w-20 mx-auto mb-3">
              <AvatarImage src={staff.avatar_url || undefined} alt={staff.full_name} />
              <AvatarFallback className="text-lg font-medium">{initials}</AvatarFallback>
            </Avatar>
            <h2 className="text-lg font-semibold">{staff.full_name}</h2>
            <p className="text-sm text-muted-foreground">
              {staff.position_name || staff.user_level_code || 'Nhân viên'}
            </p>
            <div className="mt-2 flex flex-col items-center gap-1">
              <div className={cn('flex items-center gap-1.5 text-sm font-medium', PRESENCE_TEXT_COLOR[staff.presence_state])}>
                <span className={cn('h-2 w-2 rounded-full', PRESENCE_DOT_COLOR[staff.presence_state])} />
                {PRESENCE_LABEL[staff.presence_state]}
              </div>
              {staff.last_seen_at && staff.presence_state !== 'on_shift_available' && (
                <p className="text-xs text-muted-foreground">
                  Hoạt động {formatDistanceToNow(new Date(staff.last_seen_at), { addSuffix: true, locale: vi })}
                </p>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="px-4 pb-4 flex gap-2">
            {(staff.telegram_username || staff.phone || staff.telegram_chat_id) && (
              <Button 
                className="flex-1" 
                variant="default"
                onClick={() => {
                  let telegramUrl: string | null = null
                  
                  if (staff.telegram_username) {
                    telegramUrl = `tg://resolve?domain=${staff.telegram_username}`
                  } else if (staff.phone) {
                    telegramUrl = getTelegramPhoneLink(staff.phone)
                  } else if (staff.telegram_chat_id) {
                    telegramUrl = `tg://user?id=${staff.telegram_chat_id}`
                  }
                  
                  if (telegramUrl) {
                    openTelegramWithFallback(telegramUrl, () => {
                      const downloadLink = getTelegramDownloadLink()
                      toast.info(
                        <div className="flex flex-col gap-2">
                          <span>Chưa cài Telegram trên máy</span>
                          <a 
                            href={downloadLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline font-medium"
                          >
                            Tải Telegram ngay
                          </a>
                        </div>,
                        { duration: 8000 }
                      )
                    })
                  }
                }}
              >
                <Send className="h-4 w-4 mr-2" />
                Telegram
              </Button>
            )}
            {staff.phone && (
              <Button 
                className="flex-1" 
                variant={(staff.telegram_username || staff.phone || staff.telegram_chat_id) ? "outline" : "default"}
                onClick={() => window.location.href = `tel:${staff.phone}`}
              >
                <Phone className="h-4 w-4 mr-2" />
                Gọi điện
              </Button>
            )}
            <Button 
              className="flex-1" 
              variant="outline"
              onClick={() => window.location.href = `mailto:${staff.email}`}
            >
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
          </div>

          <Separator />

          {/* Current activity */}
          {staff.status === 'busy' && staff.current_activity && (
            <>
              <div className="p-4">
                <h3 className="text-sm font-medium mb-3">Hoạt động hiện tại</h3>
                <div className="space-y-2 text-sm">
                  {staff.current_location && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span>{staff.current_location}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 flex-shrink-0 text-primary" />
                    <span className="text-primary font-medium">{staff.current_activity}</span>
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Contact info */}
          <div className="p-4">
            <h3 className="text-sm font-medium mb-3">Thông tin liên hệ</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{staff.email}</span>
              </div>
              {staff.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 flex-shrink-0" />
                  <span>{staff.phone}</span>
                </div>
              )}
              {(staff.telegram_username || staff.phone || staff.telegram_chat_id) && (
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 flex-shrink-0 text-blue-500" />
                  {staff.telegram_username ? (
                    <button 
                      onClick={() => {
                        const url = `tg://resolve?domain=${staff.telegram_username}`
                        openTelegramWithFallback(url, () => {
                          toast.info(
                            <div className="flex flex-col gap-2">
                              <span>Chưa cài Telegram</span>
                              <a href={getTelegramDownloadLink()} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">Tải ngay</a>
                            </div>,
                            { duration: 8000 }
                          )
                        })
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      @{staff.telegram_username}
                    </button>
                  ) : staff.phone ? (
                    <button 
                      onClick={() => {
                        const link = getTelegramPhoneLink(staff.phone!)
                        if (link) {
                          openTelegramWithFallback(link, () => {
                            toast.info(
                              <div className="flex flex-col gap-2">
                                <span>Chưa cài Telegram</span>
                                <a href={getTelegramDownloadLink()} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">Tải ngay</a>
                              </div>,
                              { duration: 8000 }
                            )
                          })
                        }
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      {formatPhoneForTelegram(staff.phone)}
                    </button>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      ID: {staff.telegram_chat_id} <span className="opacity-70">(cần đã từng chat)</span>
                    </span>
                  )}
                </div>
              )}
              {staff.hotel_name && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4 flex-shrink-0" />
                  <span>{staff.hotel_name}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4 flex-shrink-0" />
                <span>{staff.user_level_code || 'staff'}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Activity timeline */}
          <div className="p-4">
            <h3 className="text-sm font-medium mb-3">Hoạt động gần đây</h3>
            {loadingActivities ? (
              <div className="text-sm text-muted-foreground">Đang tải...</div>
            ) : (
              <StaffActivityTimeline activities={activities || []} />
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
