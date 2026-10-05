import { useTranslation } from 'react-i18next'
import { useHotelContext } from '@/contexts/HotelContext'
import { PricingRulesForm } from '@/components/settings/PricingRulesForm'
import { HotelBankPaymentSettings } from '@/components/settings/HotelBankPaymentSettings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

export default function PricingRulesPage() {
  const { t } = useTranslation(['settings', 'common'])
  const { selectedHotel } = useHotelContext()

  if (!selectedHotel) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Vui lòng chọn khách sạn để cấu hình quy tắc giá
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4">
      {/* Pricing Rules Section */}
      <section>
        <div className="mb-4">
          <h1 className="text-xl font-semibold">Cài đặt Phụ thu & Thuế phí</h1>
          <p className="text-sm text-muted-foreground">
            Cấu hình quy tắc tính phụ thu check-in sớm, check-out muộn và thuế phí cho {selectedHotel.name}
          </p>
        </div>
        <PricingRulesForm hotelId={selectedHotel.id} />
      </section>

      {/* Bank Payment Settings Section */}
      <section>
        <HotelBankPaymentSettings hotelId={selectedHotel.id} />
      </section>
    </div>
  )
}
