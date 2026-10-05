import { useState } from 'react'
import { FileText, X, Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { toast } from 'sonner'

interface FileUploadProps {
  files: string[]
  onChange: (files: string[]) => void
  maxFiles?: number
  accept?: string
}

export function FileUpload({ 
  files, 
  onChange, 
  maxFiles = 5,
  accept = ".pdf,.doc,.docx,.xls,.xlsx"
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const { tenant } = useTenant()

  const handleRemove = (index: number) => {
    onChange(files.filter((_, i) => i !== index))
  }

  const uploadFiles = async (filesToUpload: File[]) => {
    if (!filesToUpload.length || !tenant?.id) return

    setIsUploading(true)
    try {
      const uploadedUrls: string[] = []
      for (const file of filesToUpload) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${tenant.id}/documents/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
        const { data, error } = await supabase.storage
          .from('item-images')
          .upload(fileName, file, { cacheControl: '3600', upsert: false })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('item-images').getPublicUrl(data.path)
        uploadedUrls.push(publicUrl)
      }
      onChange([...files, ...uploadedUrls].slice(0, maxFiles))
    } catch (err: any) {
      toast.error('Không thể tải file lên. Vui lòng thử lại.')
      console.error('FileUpload error:', err)
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    await uploadFiles(selectedFiles)
    e.target.value = ''
  }
  
  return (
    <div className="space-y-4">
      {files.length > 0 && (
        <div className="grid gap-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border p-3"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm truncate">
                Tài liệu {index + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      
      {files.length < maxFiles && (
        <div
          className={cn(
            "relative rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-border"
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={async (e) => {
            e.preventDefault()
            setIsDragging(false)
            const droppedFiles = Array.from(e.dataTransfer.files)
            await uploadFiles(droppedFiles)
          }}
        >
          <input
            type="file"
            accept={accept}
            multiple
            onChange={handleFileSelect}
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={isUploading}
          />
          {isUploading ? (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Đang tải lên...
              </p>
            </>
          ) : (
            <>
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Kéo thả file hoặc click để chọn
              </p>
              <p className="text-xs text-muted-foreground">
                Tối đa {maxFiles} files
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
