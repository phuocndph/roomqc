import { useState } from 'react'
import { Upload, FileText, Download, Trash2, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

interface VendorDocumentsProps {
  vendorId: string
}

export function VendorDocuments({ vendorId }: VendorDocumentsProps) {
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  
  // Mock documents - replace with real data
  const documents = [
    {
      id: '1',
      name: 'Hợp đồng giặt là 2025.pdf',
      type: 'contract',
      size: '2.5 MB',
      uploadedAt: new Date('2025-01-01'),
      uploadedBy: 'Admin',
    },
    {
      id: '2',
      name: 'Giấy phép kinh doanh.pdf',
      type: 'license',
      size: '1.2 MB',
      uploadedAt: new Date('2024-12-15'),
      uploadedBy: 'Admin',
    },
    {
      id: '3',
      name: 'Báo giá tháng 1.xlsx',
      type: 'quotation',
      size: '156 KB',
      uploadedAt: new Date('2025-01-05'),
      uploadedBy: 'Admin',
    },
  ]
  
  const documentTypes: Record<string, { label: string; className: string }> = {
    contract: { label: 'Hợp đồng', className: 'bg-blue-100 text-blue-800' },
    license: { label: 'Giấy phép', className: 'bg-green-100 text-green-800' },
    quotation: { label: 'Báo giá', className: 'bg-purple-100 text-purple-800' },
    certificate: { label: 'Chứng chỉ', className: 'bg-orange-100 text-orange-800' },
    other: { label: 'Khác', className: 'bg-gray-100 text-gray-800' },
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Tài liệu</CardTitle>
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Tải lên
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tải lên tài liệu</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="file">Chọn file</Label>
                  <Input id="file" type="file" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="type">Loại tài liệu</Label>
                  <Select>
                    <SelectTrigger id="type" className="mt-1">
                      <SelectValue placeholder="Chọn loại" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(documentTypes).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {value.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsUploadOpen(false)}>
                    Hủy
                  </Button>
                  <Button onClick={() => setIsUploadOpen(false)}>
                    Tải lên
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              Chưa có tài liệu nào
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setIsUploadOpen(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              Tải lên tài liệu
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên file</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Kích thước</TableHead>
                    <TableHead>Ngày tải lên</TableHead>
                    <TableHead>Người tải</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{doc.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={documentTypes[doc.type].className}>
                          {documentTypes[doc.type].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{doc.size}</TableCell>
                      <TableCell>
                        {format(doc.uploadedAt, 'dd/MM/yyyy', { locale: vi })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{doc.uploadedBy}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
