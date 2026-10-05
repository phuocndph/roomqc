import { useState, useRef } from 'react'
import { FileUp, Download, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'

interface ImportExcelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onDownloadTemplate: () => void
  onParseFile: (file: File) => Promise<{
    success: boolean
    data: any[]
    errors: { row: number; message: string }[]
    totalRows: number
  }>
  onImport: (data: any[]) => Promise<{ success: number; failed: number }>
}

export function ImportExcelDialog({
  open,
  onOpenChange,
  title,
  description,
  onDownloadTemplate,
  onParseFile,
  onImport,
}: ImportExcelDialogProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<{
    success: boolean
    data: any[]
    errors: { row: number; message: string }[]
    totalRows: number
  } | null>(null)
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.match(/\.xlsx$/i)) {
      setParseResult({
        success: false,
        data: [],
        errors: [{ row: 0, message: 'Chỉ chấp nhận file Excel .xlsx (không hỗ trợ .xls)' }],
        totalRows: 0,
      })
      return
    }

    setFile(selectedFile)
    const result = await onParseFile(selectedFile)
    setParseResult(result)
    setStep('preview')
  }

  const handleImport = async () => {
    if (!parseResult?.data.length) return

    setStep('importing')
    const result = await onImport(parseResult.data)
    setImportResult(result)
    setStep('done')
  }

  const handleClose = () => {
    setStep('upload')
    setFile(null)
    setParseResult(null)
    setImportResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onOpenChange(false)
  }

  const handleReset = () => {
    setStep('upload')
    setFile(null)
    setParseResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <Button variant="outline" onClick={onDownloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Tải file mẫu
              </Button>
            </div>

            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Kéo thả file Excel hoặc click để chọn
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Chấp nhận .xlsx
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {step === 'preview' && parseResult && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{file?.name}</span>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Badge variant={parseResult.errors.length > 0 ? 'destructive' : 'default'}>
                {parseResult.data.length} / {parseResult.totalRows} hợp lệ
              </Badge>
            </div>

            {parseResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <ScrollArea className="h-24">
                    <ul className="text-sm space-y-1">
                      {parseResult.errors.map((err, i) => (
                        <li key={i}>
                          Dòng {err.row}: {err.message}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}

            {parseResult.data.length > 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription>
                  Sẵn sàng import {parseResult.data.length} mục
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 text-center">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Đang import dữ liệu...</p>
          </div>
        )}

        {step === 'done' && importResult && (
          <div className="py-4 space-y-4">
            <Alert variant={importResult.failed > 0 ? 'default' : 'default'}>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription>
                <div className="space-y-1">
                  <p>Import hoàn tất!</p>
                  <p className="text-sm">
                    ✅ Thành công: {importResult.success} | 
                    {importResult.failed > 0 && ` ❌ Thất bại: ${importResult.failed}`}
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              Hủy
            </Button>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleReset}>
                Chọn file khác
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={!parseResult?.data.length}
              >
                Import {parseResult?.data.length || 0} mục
              </Button>
            </>
          )}

          {step === 'done' && (
            <Button onClick={handleClose}>
              Đóng
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
