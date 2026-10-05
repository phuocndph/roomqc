/**
 * Nén và resize ảnh với chất lượng tùy chỉnh
 * @param file - File ảnh gốc
 * @param quality - Chất lượng nén từ 0-1 (mặc định 0.7)
 * @param maxWidth - Chiều rộng tối đa (mặc định 1200px)
 * @param maxHeight - Chiều cao tối đa (mặc định 1200px)
 */
export async function compressImage(
  file: File,
  quality: number = 0.7,
  maxWidth: number = 1200,
  maxHeight: number = 1200
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const img = new Image()
      
      img.onload = () => {
        const canvas = document.createElement('canvas')
        
        // Tính toán kích thước mới giữ nguyên tỷ lệ
        let width = img.width
        let height = img.height
        
        // Resize nếu vượt quá kích thước tối đa
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        
        canvas.width = width
        canvas.height = height
        
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }
        
        // Vẽ ảnh với kích thước mới
        ctx.drawImage(img, 0, 0, width, height)
        
        // Nén ảnh
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'))
              return
            }
            
            const compressedReader = new FileReader()
            compressedReader.onloadend = () => {
              resolve(compressedReader.result as string)
            }
            compressedReader.onerror = reject
            compressedReader.readAsDataURL(blob)
          },
          file.type,
          quality
        )
      }
      
      img.onerror = reject
      img.src = e.target?.result as string
    }
    
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
