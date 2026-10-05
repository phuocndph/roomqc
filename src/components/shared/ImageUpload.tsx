import { useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useUser } from '@/hooks/useUser';
interface ImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  className?: string;
}
export function ImageUpload({
  images,
  onChange,
  maxImages = 5,
  className
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const {
    tenantId
  } = useUser();
  const {
    uploadImages,
    isUploading
  } = useImageUpload();
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  };
  const handleFiles = async (files: File[]) => {
    if (!tenantId) {
      toast.error('Không tìm thấy tenant ID');
      return;
    }
    const remainingSlots = maxImages - images.length;
    const filesToProcess = files.slice(0, remainingSlots);
    if (filesToProcess.length === 0) return;

    // Kiểm tra loại file
    const imageFiles = filesToProcess.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} không phải là file ảnh`);
        return false;
      }
      return true;
    });
    if (imageFiles.length === 0) return;

    // Upload lên Supabase Storage
    const uploadedImages = await uploadImages(imageFiles, tenantId);
    if (uploadedImages.length > 0) {
      const imageUrls = uploadedImages.map(img => img.url);
      onChange([...images, ...imageUrls]);
    }
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };
  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };
  return (
    <div className={cn('space-y-4', className)}>
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
          {images.map((image, index) => (
            <div key={index} className="relative aspect-square">
              <img 
                src={image} 
                alt={`Upload ${index + 1}`} 
                className="h-full w-full rounded-lg object-cover" 
              />
              <button 
                type="button" 
                onClick={() => removeImage(index)} 
                className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm hover:bg-destructive/90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      
      {images.length < maxImages && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors min-h-[150px]',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50',
            !tenantId && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInput}
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={isUploading || !tenantId}
          />
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Đang tải lên...</span>
            </div>
          ) : !tenantId ? (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-10 w-10 text-muted-foreground/50" />
              <span className="text-sm text-muted-foreground">
                Đang tải thông tin người dùng...
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-full bg-primary/10 p-3">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">
                Kéo thả hoặc nhấp để chọn ảnh
              </span>
              <span className="text-xs text-muted-foreground">
                ({images.length}/{maxImages} ảnh • Tối đa 5MB/ảnh)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}