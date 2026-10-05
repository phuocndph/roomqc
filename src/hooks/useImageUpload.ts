import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export interface UploadedImage {
  url: string
  path: string
}

export function useImageUpload() {
  const [isUploading, setIsUploading] = useState(false)

  const uploadImage = async (file: File, tenantId: string): Promise<UploadedImage | null> => {
    try {
      // Tạo tên file unique
      const fileExt = file.name.split('.').pop()
      const fileName = `${tenantId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      
      // Upload lên Supabase Storage
      const { data, error } = await supabase.storage
        .from('item-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (error) {
        console.error('Upload error:', error)
        throw error
      }

      // Lấy public URL
      const { data: { publicUrl } } = supabase.storage
        .from('item-images')
        .getPublicUrl(data.path)

      return {
        url: publicUrl,
        path: data.path,
      }
    } catch (error) {
      console.error('Error uploading image:', error)
      return null
    }
  }

  const uploadImages = async (files: File[], tenantId: string): Promise<UploadedImage[]> => {
    setIsUploading(true)
    const uploadedImages: UploadedImage[] = []

    try {
      for (const file of files) {
        const result = await uploadImage(file, tenantId)
        if (result) {
          uploadedImages.push(result)
        }
      }

      if (uploadedImages.length > 0) {
        toast.success(`Đã tải lên ${uploadedImages.length} ảnh`)
      }
    } catch (error) {
      console.error('Error uploading images:', error)
      toast.error('Lỗi khi tải ảnh lên')
    } finally {
      setIsUploading(false)
    }

    return uploadedImages
  }

  const deleteImage = async (path: string): Promise<boolean> => {
    try {
      const { error } = await supabase.storage
        .from('item-images')
        .remove([path])

      if (error) {
        console.error('Delete error:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error deleting image:', error)
      return false
    }
  }

  return {
    uploadImage,
    uploadImages,
    deleteImage,
    isUploading,
  }
}
