import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { navigateBack } from '@/lib/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { CreateBatchStep1 } from '@/components/laundry/CreateBatchStep1'
import { CreateBatchStep2 } from '@/components/laundry/CreateBatchStep2'
import { CreateBatchStep3 } from '@/components/laundry/CreateBatchStep3'
import { MobileBatchForm } from '@/components/laundry/MobileBatchForm'
import { useCreateLaundryBatch } from '@/hooks/useLaundryBatches'
import { useBreakpoint } from '@/lib/breakpoints'
import { useTranslation } from 'react-i18next'
import { useHotelContext } from '@/contexts/HotelContext'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import type { CreateBatchStep1Data, CreateBatchStep2Data, CreateBatchStep3Data } from '@/types/laundry.types'

export function CreateBatchPage() {
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const { t } = useTranslation('laundry')
  const { isAllHotelsMode } = useHotelContext()
  
  // Gọi TẤT CẢ hooks trước điều kiện isMobile
  const [step, setStep] = useState(1)
  const [step1Data, setStep1Data] = useState<CreateBatchStep1Data | null>(null)
  const [step2Data, setStep2Data] = useState<CreateBatchStep2Data | null>(null)
  const { mutate: createBatch, isPending } = useCreateLaundryBatch()
  
  // Kiểm tra mobile SAU KHI tất cả hooks đã được gọi
  if (isMobile) {
    return <MobileBatchForm />
  }
  
  const handleStep1Complete = (data: CreateBatchStep1Data) => {
    setStep1Data(data)
    setStep(2)
  }
  
  const handleStep2Complete = (data: CreateBatchStep2Data) => {
    setStep2Data(data)
    setStep(3)
  }
  
  const handleStep3Complete = (data: CreateBatchStep3Data) => {
    if (!step1Data || !step2Data) return
    
    const batchData = {
      step1: step1Data,
      step2: step2Data,
      step3: data,
    }
    
    createBatch(batchData, {
      onSuccess: () => {
        navigate('/laundry')
      },
    })
  }
  
  const steps = [
    { number: 1, title: t('createBatch.steps.basicInfo', 'Thông tin cơ bản') },
    { number: 2, title: t('createBatch.steps.selectItems', 'Chọn đồ giặt') },
    { number: 3, title: t('createBatch.steps.confirm', 'Xác nhận') },
  ]
  
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('createBatch.title', 'Tạo lô giặt mới')}
        description={t('createBatch.description', 'Tạo lô giặt và giao cho đơn vị giặt')}
      >
        <Button variant="outline" onClick={() => navigateBack(navigate, '/laundry')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common:back', 'Quay lại')}
        </Button>
      </PageHeader>
      
      {/* All Hotels Warning */}
      {isAllHotelsMode && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Vui lòng chọn một khách sạn cụ thể để tạo mới. Chế độ "Tất cả khách sạn" chỉ hỗ trợ xem dữ liệu.
          </AlertDescription>
        </Alert>
      )}

      {/* Stepper */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Progress bar */}
            <Progress value={(step / 3) * 100} />
            
            {/* Step indicators */}
            <div className="flex justify-between">
              {steps.map((s) => (
                <div
                  key={s.number}
                  className="flex flex-col items-center gap-2"
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                      step >= s.number
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted bg-background text-muted-foreground'
                    }`}
                  >
                    {s.number}
                  </div>
                  <p
                    className={`text-sm ${
                      step >= s.number ? 'text-foreground font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    {s.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Step Content */}
      {step === 1 && (
        <CreateBatchStep1
          initialData={step1Data}
          onComplete={handleStep1Complete}
          onBack={() => navigateBack(navigate, '/laundry')}
          disabled={isAllHotelsMode}
        />
      )}
      
      {step === 2 && (
        <CreateBatchStep2
          initialData={step2Data}
          step1Data={step1Data!}
          onComplete={handleStep2Complete}
          onBack={() => setStep(1)}
        />
      )}
      
      {step === 3 && (
        <CreateBatchStep3
          step1Data={step1Data!}
          step2Data={step2Data!}
          onComplete={handleStep3Complete}
          onBack={() => setStep(2)}
          isSubmitting={isPending}
        />
      )}
    </div>
  )
}
