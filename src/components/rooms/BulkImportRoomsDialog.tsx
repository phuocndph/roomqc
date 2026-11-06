import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileSpreadsheet, Download, Upload, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useBulkCreateRooms } from '@/hooks/useBulkCreateRooms'
import { saveAs } from 'file-saver'
import { createRoomImportWorkbook, readRoomImportFile, roomImportTypeLabel, roomTemplateFilename, type ImportedRoom, type RoomTemplateHotel } from '@/lib/rooms/importWorkbook'

interface BulkImportRoomsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hotelId: string
  hotelName: string
  hotelDetails?: RoomTemplateHotel
}

export function BulkImportRoomsDialog({
  open,
  onOpenChange,
  hotelId,
  hotelName,
  hotelDetails,
}: BulkImportRoomsDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedRooms, setParsedRooms] = useState<ImportedRoom[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [importResult, setImportResult] = useState<{
    success: number; failed: number; errors: Array<{ row: number; room_number: string; error: string }>
  } | null>(null)
  const [importFailure, setImportFailure] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const parseVersion = useRef(0)

  const bulkCreateMutation = useBulkCreateRooms()

  const downloadTemplate = async () => {
    setIsDownloading(true)
    try {
      const hotel = { ...hotelDetails, name: hotelName }
      const workbook = createRoomImportWorkbook(hotel)
      const buffer = await workbook.xlsx.writeBuffer()
      saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), roomTemplateFilename(hotel))
      toast.success('Đã tải mẫu phòng có thông tin khách sạn')
    } catch {
      toast.error('Chưa tạo được file mẫu. Vui lòng thử lại.')
    } finally { setIsDownloading(false) }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    e.target.value = ''
    const version = ++parseVersion.current
    setFile(null)
    setImportResult(null)
    setImportFailure('')
    setValidationErrors([])
    setParsedRooms([])
    setIsReading(false)

    if (!selectedFile.name.match(/\.xlsx$/i)) {
      setValidationErrors(['Chọn file Excel .xlsx. Nếu đang dùng .xls, hãy mở bằng Excel và Lưu thành .xlsx.'])
      toast.error('Vui lòng chọn file Excel .xlsx')
      return
    }

    setFile(selectedFile)
    setIsReading(true)

    void (async () => {
      try {
        const { rooms, errors } = await readRoomImportFile(selectedFile)
        if (version !== parseVersion.current) return

        if (errors.length > 0) {
          setValidationErrors(errors)
          toast.error(`Phát hiện ${errors.length} lỗi trong file`)
        } else if (rooms.length === 0) {
          setValidationErrors(['File chưa có phòng. Điền ít nhất một phòng trong sheet Danh sách phòng rồi lưu và chọn lại file.'])
          toast.error('File chưa có dữ liệu phòng')
        } else {
          setParsedRooms(rooms)
          toast.success(`Đã đọc thành công ${rooms.length} phòng`)
        }
      } catch (error) {
        if (version !== parseVersion.current) return
        const message = error instanceof Error ? error.message : 'Không đọc được file Excel. Hãy dùng file .xlsx hợp lệ.'
        setValidationErrors([message])
        toast.error(message)
      } finally { if (version === parseVersion.current) setIsReading(false) }
    })()
  }

  const handleImport = async () => {
    if (parsedRooms.length === 0) return

    setIsProcessing(true)
    setImportFailure('')
    try {
      const result = await bulkCreateMutation.mutateAsync({
        rooms: parsedRooms,
        hotelId
      })
      setImportResult(result)
      
    } catch (error) {
      setImportFailure(error instanceof Error ? error.message : 'Chưa hoàn tất nhập phòng. Kiểm tra danh sách phòng trước khi thử lại.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    if (!isProcessing) {
      parseVersion.current++
      setIsReading(false)
      onOpenChange(false)
      // Reset state
      setFile(null)
      setParsedRooms([])
      setValidationErrors([])
      setImportResult(null)
      setImportFailure('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Nhập phòng từ Excel - {hotelName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Download Template */}
          <Alert>
            <Download className="h-4 w-4" />
            <AlertDescription>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1"><p className="font-medium">1. Tải mẫu và điền thông tin phòng</p><p className="text-sm">Mẫu có đầy đủ giá, tiện nghi, diện tích, giường, sức chứa và trạng thái phòng.</p></div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplate}
                  disabled={isDownloading || isProcessing}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isDownloading ? 'Đang tạo mẫu…' : 'Tải file mẫu'}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">Tất cả cột đều hiển thị trong Excel. Ba cột nhận diện được cố định; cuộn ngang để điền các thông tin còn lại.</p>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">2. Chọn file .xlsx đã điền để kiểm tra</label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => document.getElementById('file-input')?.click()}
                disabled={isProcessing || isReading}
              >
                <Upload className="h-4 w-4 mr-2" />
                {file ? file.name : 'Chọn file'}
              </Button>
              <input
                id="file-input"
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                className="hidden"
                disabled={isProcessing}
              />
            </div>
          </div>

          {isReading && <p role="status" className="text-sm">Đang đọc và kiểm tra file…</p>}

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-2">Cần sửa {validationErrors.length} vấn đề trước khi nhập</div>
                <p className="text-sm mb-2">Sửa trong Excel, lưu file rồi bấm Chọn file để kiểm tra lại. Chưa nhập phòng từ file này.</p>
                <ScrollArea className="h-32">
                  <ul className="space-y-1 text-sm">
                    {validationErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {parsedRooms.length > 0 && !importResult && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <div className="font-medium text-green-600 mb-2">
                  3. Kiểm tra {parsedRooms.length} phòng trước khi nhập
                </div>
                <p className="text-sm mb-2">Nếu bỏ trống: sức chứa 2 khách, trạng thái Trống đã dọn, có cửa sổ, không ban công và không hút thuốc. Giá cơ bản/đêm và tiện nghi sẽ được lưu vào hồ sơ phòng.</p>
                <ScrollArea className="h-32">
                  <div className="text-sm space-y-1">
                    {parsedRooms.slice(0, 10).map((room, index) => (
                      <div key={index}>
                        • {room.room_number} - Tầng {room.floor} - {roomImportTypeLabel(room.room_type)} - {room.max_guests ?? 2} khách (dòng {room.source_row})
                      </div>
                    ))}
                    {parsedRooms.length > 10 && (
                      <div className="text-muted-foreground">
                        ... và {parsedRooms.length - 10} phòng khác
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {/* Import Result */}
          {importResult && (
            <Alert variant={importResult.failed === 0 ? 'default' : 'destructive'}>
              {importResult.failed === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="font-medium mb-2">
                  Đã nhập {importResult.success} phòng, {importResult.failed} phòng chưa nhập
                </div>
                {importResult.errors.length > 0 && (
                  <ScrollArea className="h-32">
                    <div className="text-sm space-y-1">
                      {importResult.errors.map((error, index) => (
                        <div key={index}>
                          • Dòng {error.row} ({error.room_number}): {error.error}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
                {importResult.failed > 0 && <p className="text-sm mt-2">Chỉ giữ các dòng chưa nhập trong file, sửa lỗi rồi chọn lại. Không cần nhập lại các phòng đã thành công.</p>}
              </AlertDescription>
            </Alert>
          )}

          {importFailure && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{importFailure}</AlertDescription></Alert>}

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Đang nhập phòng…</div>
              <Progress value={undefined} className="w-full" />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isProcessing}
            >
              {importResult ? 'Đóng' : 'Hủy'}
            </Button>
            <Button
              onClick={handleImport}
              disabled={parsedRooms.length === 0 || isReading || isProcessing || !!importResult}
            >
              {isProcessing ? 'Đang nhập phòng…' : `Nhập ${parsedRooms.length || ''} phòng`.replace('  ', ' ')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
