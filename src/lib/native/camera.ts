import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera'

export async function takeNativePhoto(): Promise<File | null> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera, direction: CameraDirection.Rear,
      resultType: CameraResultType.Uri, quality: 80, width: 1600, height: 1600,
      correctOrientation: true, saveToGallery: false,
      promptLabelHeader: 'Ảnh kiểm tra phòng', promptLabelCancel: 'Hủy',
    })
    if (!photo.webPath) throw new Error('Máy ảnh chưa trả về ảnh. Vui lòng thử lại.')
    const response = await fetch(photo.webPath)
    if (!response.ok) throw new Error('Không đọc được ảnh vừa chụp.')
    const blob = await response.blob()
    return new File([blob], `roomqc-${crypto.randomUUID()}.${photo.format}`, { type: blob.type || `image/${photo.format}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/cancel(?:led|ed)?|no image picked/i.test(message)) return null
    if (/permission|denied|access/i.test(message)) throw new Error('Hãy cho phép RoomQC dùng máy ảnh trong Cài đặt của điện thoại.')
    throw error
  }
}
