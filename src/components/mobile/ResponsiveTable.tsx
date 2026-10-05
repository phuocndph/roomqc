import React from 'react'
import { useBreakpoint } from '@/lib/breakpoints'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface TableColumn<T> {
  key: string
  label: string
  render?: (item: T) => React.ReactNode
  hideOnMobile?: boolean
}

interface ResponsiveTableProps<T> {
  data: T[]
  columns: TableColumn<T>[]
  mobileCardRenderer: (item: T, index: number) => React.ReactNode
  emptyMessage?: string
  className?: string
}

export function ResponsiveTable<T extends Record<string, any>>({
  data,
  columns,
  mobileCardRenderer,
  emptyMessage = 'No data available',
  className = ''
}: ResponsiveTableProps<T>) {
  const { isMobile } = useBreakpoint()

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  // Mobile: Card List
  if (isMobile) {
    return (
      <div className="space-y-3">
        {data.map((item, index) => (
          <Card key={index} className="p-4">
            {mobileCardRenderer(item, index)}
          </Card>
        ))}
      </div>
    )
  }

  // Desktop: Table
  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, index) => (
              <TableRow key={index}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {col.render ? col.render(item) : item[col.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
