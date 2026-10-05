import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileSpreadsheet, Download, Upload, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useBulkCreateRooms } from '@/hooks/useBulkCreateRooms'
import { downloadWorkbook, objectRecordsToRows, readExcelObjects } from '@/lib/excelUtils'

interface BulkImportRoomsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hotelId: string
  hotelName: string
}

interface ParsedRoom {
  room_number: string
  floor: number
  room_type: string
  status?: string
  bed_type?: string
  max_guests?: number
  area_sqm?: number
  base_price?: number
  amenities?: string[]
  has_balcony?: boolean
  has_window?: boolean
  smoking_allowed?: boolean
  view_type?: string
  notes?: string
}

export function BulkImportRoomsDialog({
  open,
  onOpenChange,
  hotelId,
  hotelName
}: BulkImportRoomsDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedRooms, setParsedRooms] = useState<ParsedRoom[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [importResult, setImportResult] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const bulkCreateMutation = useBulkCreateRooms()

  const downloadTemplate = async () => {
    const template = [
      {
        'Số phòng*': 'P101',
        'Tầng*': 1,
        'Loại phòng*': 'standard',
        'Trạng thái': 'vacant',
        'Loại giường': 'double',
        'Số khách tối đa': 2,
        'Diện tích (m²)': 25,
        'Giá cơ bản': 500000,
        'Tiện nghi (cách nhau bằng dấu ;)': 'wifi;tv;minibar',
        'Ban công (yes/no)': 'yes',
        'Cửa sổ (yes/no)': 'yes',
        'Cho phép hút thuốc (yes/no)': 'no',
        'Loại view': 'city',
        'Ghi chú': ''
      },
      {
        'Số phòng*': 'P102',
        'Tầng*': 1,
        'Loại phòng*': 'deluxe',
        'Trạng thái': 'vacant',
        'Loại giường': 'king',
        'Số khách tối đa': 2,
        'Diện tích (m²)': 35,
        'Giá cơ bản': 800000,
        'Tiện nghi (cách nhau bằng dấu ;)': 'wifi;tv;minibar;bathtub',
        'Ban công (yes/no)': 'yes',
        'Cửa sổ (yes/no)': 'yes',
        'Cho phép hút thuốc (yes/no)': 'no',
        'Loại view': 'ocean',
        'Ghi chú': 'Phòng view đẹp'
      }
    ]

    await downloadWorkbook([{
      name: 'Rooms',
      rows: objectRecordsToRows(template),
      columnWidths: [15, 8, 12, 12, 12, 15, 15, 15, 30, 15, 15, 20, 12, 20],
    }], 'mau_import_phong.xlsx')
    toast.success('Đã tải xuống file mẫu')
  }

  const parseYesNo = (value: any): boolean => {
    if (typeof value === 'boolean') return value
    const str = String(value).toLowerCase().trim()
    return str === 'yes' || str === 'có' || str === 'true' || str === '1'
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.match(/\.xlsx$/i)) {
      toast.error('Vui lòng chọn file Excel .xlsx (không hỗ trợ .xls)')
      return
    }

    setFile(selectedFile)
    setImportResult(null)
    setValidationErrors([])
    setParsedRooms([])

    void (async () => {
      try {
        const jsonData = await readExcelObjects(selectedFile)

        const rooms: ParsedRoom[] = []
        const errors: string[] = []

        jsonData.forEach((row: any, index: number) => {
          const rowNum = index + 2 // Excel row number (header is row 1)

          // Required fields
          const room_number = row['Số phòng*']
          const floor = row['Tầng*']
          const room_type = row['Loại phòng*']

          if (!room_number) {
            errors.push(`Dòng ${rowNum}: Thiếu số phòng`)
            return
          }
          if (floor === undefined || floor === null) {
            errors.push(`Dòng ${rowNum}: Thiếu tầng`)
            return
          }
          if (!room_type) {
            errors.push(`Dòng ${rowNum}: Thiếu loại phòng`)
            return
          }

          // Parse amenities
          const amenitiesStr = row['Tiện nghi (cách nhau bằng dấu ;)']
          const amenities = amenitiesStr 
            ? String(amenitiesStr).split(';').map(a => a.trim()).filter(Boolean)
            : []

          rooms.push({
            room_number: String(room_number).trim(),
            floor: Number(floor),
            room_type: String(room_type).trim().toLowerCase(),
            status: row['Trạng thái'] ? String(row['Trạng thái']).trim().toLowerCase() : 'vacant',
            bed_type: row['Loại giường'] ? String(row['Loại giường']).trim().toLowerCase() : undefined,
            max_guests: row['Số khách tối đa'] ? Number(row['Số khách tối đa']) : undefined,
            area_sqm: row['Diện tích (m²)'] ? Number(row['Diện tích (m²)']) : undefined,
            base_price: row['Giá cơ bản'] ? Number(row['Giá cơ bản']) : undefined,
            amenities,
            has_balcony: row['Ban công (yes/no)'] ? parseYesNo(row['Ban công (yes/no)']) : false,
            has_window: row['Cửa sổ (yes/no)'] !== undefined ? parseYesNo(row['Cửa sổ (yes/no)']) : true,
            smoking_allowed: row['Cho phép hút thuốc (yes/no)'] ? parseYesNo(row['Cho phép hút thuốc (yes/no)']) : false,
            view_type: row['Loại view'] ? String(row['Loại view']).trim().toLowerCase() : undefined,
            notes: row['Ghi chú'] ? String(row['Ghi chú']).trim() : undefined
          })
        })

        if (errors.length > 0) {
          setValidationErrors(errors)
          toast.error(`Phát hiện ${errors.length} lỗi trong file`)
        } else if (rooms.length === 0) {
          toast.error('Không tìm thấy dữ liệu phòng trong file')
        } else {
          setParsedRooms(rooms)
          toast.success(`Đã đọc thành công ${rooms.length} phòng`)
        }
      } catch (error) {
        toast.error('Lỗi đọc file Excel')
        console.error(error)
      }
    })()
  }

  const handleImport = async () => {
    if (parsedRooms.length === 0) return

    setIsProcessing(true)
    try {
      const result = await bulkCreateMutation.mutateAsync({
        rooms: parsedRooms,
        hotelId
      })
      setImportResult(result)
      
      if (result.failed === 0) {
        setTimeout(() => {
          onOpenChange(false)
          // Reset state
          setFile(null)
          setParsedRooms([])
          setImportResult(null)
        }, 2000)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    if (!isProcessing) {
      onOpenChange(false)
      // Reset state
      setFile(null)
      setParsedRooms([])
      setValidationErrors([])
      setImportResult(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Tải lên hàng loạt phòng - {hotelName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Download Template */}
          <Alert>
            <Download className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span>Tải xuống file mẫu Excel để lấy dữ liệu mẫu</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplate}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Tải file mẫu
                </Button>
              </div>
            </AlertDescription>
          </Alert>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Chọn file Excel</label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => document.getElementById('file-input')?.click()}
                disabled={isProcessing}
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

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-2">Phát hiện {validationErrors.length} lỗi:</div>
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
                  Sẵn sàng import {parsedRooms.length} phòng
                </div>
                <ScrollArea className="h-32">
                  <div className="text-sm space-y-1">
                    {parsedRooms.slice(0, 10).map((room, index) => (
                      <div key={index}>
                        • {room.room_number} - Tầng {room.floor} - {room.room_type}
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
                  Kết quả import: {importResult.success} thành công, {importResult.failed} thất bại
                </div>
                {importResult.errors.length > 0 && (
                  <ScrollArea className="h-32">
                    <div className="text-sm space-y-1">
                      {importResult.errors.map((error: any, index: number) => (
                        <div key={index}>
                          • Dòng {error.row} ({error.room_number}): {error.error}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Đang import phòng...</div>
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
              disabled={parsedRooms.length === 0 || isProcessing || !!importResult}
            >
              {isProcessing ? 'Đang import...' : 'Bắt đầu tải lên'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
