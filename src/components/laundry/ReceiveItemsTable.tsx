import { Package } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatCurrency } from '@/lib/utils'

interface ReceiveItemsTableProps {
  items: any[]
  formItems: any[]
  onUpdateItem: (index: number, field: string, value: any) => void
}

export function ReceiveItemsTable({
  items,
  formItems,
  onUpdateItem,
}: ReceiveItemsTableProps) {
  return (
    <div className="rounded-none border">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Ảnh</TableHead>
              <TableHead>Đồ dùng</TableHead>
              <TableHead className="text-center">SL giao</TableHead>
              <TableHead className="text-center w-24">SL nhận</TableHead>
              <TableHead className="text-center w-24">Mất</TableHead>
              <TableHead className="text-center w-24">Hỏng</TableHead>
              <TableHead className="w-40">Tình trạng</TableHead>
              <TableHead className="text-right w-28">Bồi thường</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const formItem = formItems[index]
              if (!formItem) return null
              const hasIssue =
                formItem.quantity_lost > 0 || formItem.quantity_damaged > 0
              const unitPrice = (item as any).item?.unit_price || 0
              const compensationAmount =
                (formItem.quantity_lost + formItem.quantity_damaged) * unitPrice

              return (
                <TableRow
                  key={item.id}
                  className={cn(
                    'hover:bg-slate-50 dark:hover:bg-slate-800',
                    hasIssue && 'border-l-4 border-l-orange-700',
                  )}
                >
                  <TableCell>
                    {(item as any).item?.images?.[0] ? (
                      <img
                        src={(item as any).item.images[0]}
                        alt={(item as any).item.name}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">
                        {item.item_name || item.item?.name || 'Đồ giặt'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.item_code || item.item?.code}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {item.quantity_delivered}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={item.quantity_delivered}
                      value={formItem.quantity_returned}
                      aria-label={`Số nhận ${item.item_name || item.item?.name || index + 1}`}
                      onChange={(e) =>
                        onUpdateItem(
                          index,
                          'quantity_returned',
                          parseInt(e.target.value) || 0,
                        )
                      }
                      className="text-center"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={item.quantity_delivered}
                      value={formItem.quantity_lost}
                      aria-label={`Số mất ${item.item_name || item.item?.name || index + 1}`}
                      onChange={(e) =>
                        onUpdateItem(
                          index,
                          'quantity_lost',
                          parseInt(e.target.value) || 0,
                        )
                      }
                      className={cn(
                        'text-center',
                        formItem.quantity_lost > 0 &&
                          'border-red-700 text-red-700 dark:text-red-400',
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={item.quantity_delivered}
                      value={formItem.quantity_damaged}
                      aria-label={`Số hỏng ${item.item_name || item.item?.name || index + 1}`}
                      onChange={(e) =>
                        onUpdateItem(
                          index,
                          'quantity_damaged',
                          parseInt(e.target.value) || 0,
                        )
                      }
                      className={cn(
                        'text-center',
                        formItem.quantity_damaged > 0 &&
                          'border-orange-700 text-orange-700 dark:text-orange-400',
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={formItem.return_condition}
                      onValueChange={(value) =>
                        onUpdateItem(index, 'return_condition', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Tốt">Tốt</SelectItem>
                        <SelectItem value="Vết bẩn còn">Vết bẩn còn</SelectItem>
                        <SelectItem value="Mùi lạ">Mùi lạ</SelectItem>
                        <SelectItem value="Nhăn nhiều">Nhăn nhiều</SelectItem>
                        <SelectItem value="Khác">Khác</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    {hasIssue ? (
                      <span className="text-red-600 font-medium">
                        {formatCurrency(compensationAmount)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
