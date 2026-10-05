import { AvailableRoom } from '@/hooks/useAvailableRooms'
import type { PriceBreakdown } from '@/hooks/useRoomTypeRates'

export type BookingType = 'daily' | 'hourly' | 'monthly'

export interface SelectedRoomWithPrice extends AvailableRoom {
  customPrice: number
  priceBreakdown?: PriceBreakdown | null
}

export interface BookingFormState {
  // Step 1: Booking Type & Dates/Times
  bookingType: BookingType
  
  // Daily booking
  checkInDate: Date | undefined
  checkOutDate: Date | undefined
  checkInTime: string
  checkOutTime: string
  
  // Hourly booking
  hourlyDate: Date | undefined
  hourlyStartTime: string
  bookingHours: number
  
  // Monthly booking
  monthlyStartDate: Date | undefined
  bookingMonths: number
  
  // Step 2: Rooms
  selectedRooms: SelectedRoomWithPrice[]
  
  // Step 3: Guest Info
  guestName: string
  guestPhone: string
  guestEmail: string
  guestCount: number
  bookingSource: string
  bookingReference: string
  notes: string
  
  // Guest ID (from document scanner)
  guestIdType: string
  guestIdNumber: string
  guestNationality: string
  guestDateOfBirth: string
  guestGender: string
  guestAddress: string
  guestIdImageUrl: string
  
  // Step 4: Payment
  includeVat: boolean
  vatRate: number
  includeServiceFee: boolean
  serviceFeeRate: number
  depositAmount: number
  otaPaymentType: string
  otaPaidAmount: number
  otaCommissionRate: number
}

export interface BookingFormComputed {
  nights: number
  hours: number
  months: number
  totalRoomPrice: number
  subtotal: number
  vatAmount: number
  serviceFeeAmount: number
  estimatedTotal: number
  otaCommissionAmount: number
  netRevenue: number
  remainingAmount: number
  isOtaSource: boolean
  // For display
  displayDuration: string
}

export interface StepValidation {
  isStep1Valid: boolean
  isStep2Valid: boolean
  isStep3Valid: boolean
  isStep4Valid: boolean
}

export type WizardStep = 1 | 2 | 3 | 4 | 5

export interface WizardStepInfo {
  step: WizardStep
  title: string
  shortTitle: string
}

export const WIZARD_STEPS: WizardStepInfo[] = [
  { step: 1, title: 'Loại & Thời gian', shortTitle: 'Loại' },
  { step: 2, title: 'Chọn phòng', shortTitle: 'Phòng' },
  { step: 3, title: 'Thông tin khách', shortTitle: 'Khách' },
  { step: 4, title: 'Thanh toán', shortTitle: 'Tiền' },
  { step: 5, title: 'Xác nhận', shortTitle: 'Xác nhận' },
]

// Monthly discount configuration
export const MONTHLY_DISCOUNTS: Record<number, number> = {
  1: 0,
  2: 0,
  3: 5,
  6: 10,
  12: 15,
}

// Hourly booking constraints
export const HOURLY_MIN_HOURS = 2
export const HOURLY_MAX_HOURS = 8
export const HOURLY_TIME_SLOTS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00',
]
