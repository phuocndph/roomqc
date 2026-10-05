import { User, Phone, Mail, Users, Globe, CreditCard, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BOOKING_SOURCES } from '@/lib/constants'
import { BookingFormState, BookingFormComputed } from '../types'
import { DocumentScanner, ScannedDocumentData } from '../../DocumentScanner'
import { GuestAutoComplete } from '@/components/guests/GuestAutoComplete'

interface GuestInfoStepProps {
  state: BookingFormState
  computed: BookingFormComputed
  onUpdate: (data: Partial<BookingFormState>) => void
}

export function GuestInfoStep({ state, computed, onUpdate }: GuestInfoStepProps) {
  const handleScanComplete = (data: ScannedDocumentData, documentType: string, imageUrl?: string) => {
    onUpdate({
      guestName: data.full_name || state.guestName,
      guestIdType: documentType,
      guestIdNumber: data.id_number || '',
      guestNationality: data.nationality || '',
      guestDateOfBirth: data.date_of_birth || '',
      guestGender: data.gender || '',
      guestAddress: data.address || '',
      guestIdImageUrl: imageUrl || '',
    })
  }

  return (
    <div className="space-y-4">
      {/* Document Scanner */}
      <DocumentScanner onScanComplete={handleScanComplete} />
      
      {/* Guest Name */}
      <div className="space-y-2">
        <Label htmlFor="guestName" className="flex items-center gap-2">
          <User className="h-4 w-4" />
          Tên khách *
        </Label>
        <Input
          id="guestName"
          value={state.guestName}
          onChange={(e) => onUpdate({ guestName: e.target.value })}
          placeholder="Nhập tên khách hàng"
          required
        />
      </div>
      
      {/* Contact Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="guestPhone" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Số điện thoại
          </Label>
          <Input
            id="guestPhone"
            value={state.guestPhone}
            onChange={(e) => onUpdate({ guestPhone: e.target.value })}
            placeholder="0909..."
          />
          <GuestAutoComplete
            phone={state.guestPhone}
            onGuestFound={(guest) => {
              onUpdate({
                guestName: guest.full_name,
                guestPhone: guest.phone || state.guestPhone,
                guestEmail: guest.email || '',
                guestIdType: guest.id_type || '',
                guestIdNumber: guest.id_number || '',
                guestNationality: guest.nationality || '',
                guestAddress: guest.address || '',
                guestGender: guest.gender || '',
                guestDateOfBirth: guest.date_of_birth || '',
                guestIdImageUrl: guest.id_image_url || '',
              })
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="guestEmail" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email
          </Label>
          <Input
            id="guestEmail"
            type="email"
            value={state.guestEmail}
            onChange={(e) => onUpdate({ guestEmail: e.target.value })}
            placeholder="email@..."
          />
        </div>
      </div>
      
      {/* ID Info Row (shown after scan or manual input) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Loại giấy tờ
          </Label>
          <Select value={state.guestIdType || ''} onValueChange={(v) => onUpdate({ guestIdType: v })}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Chọn loại" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cccd">CCCD / CMND</SelectItem>
              <SelectItem value="passport">Hộ chiếu</SelectItem>
              <SelectItem value="visa">Visa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="guestIdNumber" className="flex items-center gap-2">
            Số giấy tờ
          </Label>
          <Input
            id="guestIdNumber"
            value={state.guestIdNumber}
            onChange={(e) => onUpdate({ guestIdNumber: e.target.value })}
            placeholder="Số CCCD/Passport..."
          />
        </div>
      </div>

      {/* Nationality & Address (if available) */}
      {(state.guestIdType || state.guestNationality || state.guestAddress) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="guestNationality">Quốc tịch</Label>
            <Input
              id="guestNationality"
              value={state.guestNationality}
              onChange={(e) => onUpdate({ guestNationality: e.target.value })}
              placeholder="Việt Nam"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guestAddress" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Địa chỉ
            </Label>
            <Input
              id="guestAddress"
              value={state.guestAddress}
              onChange={(e) => onUpdate({ guestAddress: e.target.value })}
              placeholder="Địa chỉ..."
            />
          </div>
        </div>
      )}
      
      {/* Guest Count & Booking Source */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="guestCount" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Số khách
          </Label>
          <Input
            id="guestCount"
            type="number"
            min={1}
            max={10}
            value={state.guestCount}
            onChange={(e) => onUpdate({ guestCount: parseInt(e.target.value) || 1 })}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Nguồn đặt phòng
          </Label>
          <Select value={state.bookingSource} onValueChange={(v) => onUpdate({ bookingSource: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOOKING_SOURCES.map(source => (
                <SelectItem key={source.value} value={source.value}>
                  {source.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Booking Reference & Notes */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="bookingReference">Mã đặt phòng OTA</Label>
          <Input
            id="bookingReference"
            value={state.bookingReference}
            onChange={(e) => onUpdate({ bookingReference: e.target.value })}
            placeholder="ABC123..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Ghi chú</Label>
          <Input
            id="notes"
            value={state.notes}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            placeholder="VIP, yêu cầu đặc biệt..."
          />
        </div>
      </div>
    </div>
  )
}
