import QRCode from 'qrcode'

export async function generateQRDataURL(data: string, size = 200): Promise<string> {
  return QRCode.toDataURL(data, { width: size, margin: 1, errorCorrectionLevel: 'M' })
}
