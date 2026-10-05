import { useEffect, useRef } from 'react'
import QRCodeStyling from 'qr-code-styling'

interface QRCodeDisplayProps {
  value: string
  size?: number
}

export function QRCodeDisplay({ value, size = 200 }: QRCodeDisplayProps) {
  const ref = useRef<HTMLDivElement>(null)
  const qrCode = useRef<QRCodeStyling | null>(null)
  
  useEffect(() => {
    if (!qrCode.current) {
      qrCode.current = new QRCodeStyling({
        width: size,
        height: size,
        data: value,
        margin: 0,
        qrOptions: {
          typeNumber: 0,
          mode: 'Byte',
          errorCorrectionLevel: 'Q',
        },
        imageOptions: {
          hideBackgroundDots: true,
          imageSize: 0.4,
          margin: 4,
        },
        dotsOptions: {
          type: 'rounded',
          color: '#000000',
        },
        backgroundOptions: {
          color: '#ffffff',
        },
        cornersSquareOptions: {
          type: 'extra-rounded',
          color: '#000000',
        },
        cornersDotOptions: {
          type: 'dot',
          color: '#000000',
        },
      })
    } else {
      qrCode.current.update({
        data: value,
      })
    }
    
    if (ref.current) {
      ref.current.innerHTML = ''
      qrCode.current.append(ref.current)
    }
  }, [value, size])
  
  return <div ref={ref} />
}
