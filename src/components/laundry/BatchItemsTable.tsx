import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Package } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface BatchItemsTableProps {
  items: any[]
  batchStatus: string
}

export function BatchItemsTable({ items, batchStatus }: BatchItemsTableProps) {
  const { t } = useTranslation(['laundry'])
  
  const allItems = items
  const receivedItems = items.filter(item => item.quantity_returned > 0)
  const lostItems = items.filter(item => item.quantity_lost > 0)
  const damagedItems = items.filter(item => item.quantity_damaged > 0)
  
  return (
    <Tabs defaultValue="all">
      <TabsList>
        <TabsTrigger value="all">{t('batchItems.tabs.all')} ({allItems.length})</TabsTrigger>
        {batchStatus === 'received' && (
          <>
            <TabsTrigger value="received">{t('batchItems.tabs.received')} ({receivedItems.length})</TabsTrigger>
            {lostItems.length > 0 && (
              <TabsTrigger value="lost">{t('batchItems.tabs.lost')} ({lostItems.length})</TabsTrigger>
            )}
            {damagedItems.length > 0 && (
              <TabsTrigger value="damaged">{t('batchItems.tabs.damaged')} ({damagedItems.length})</TabsTrigger>
            )}
          </>
        )}
      </TabsList>
      
      <TabsContent value="all" className="mt-4">
        <ItemsTableContent items={allItems} batchStatus={batchStatus} />
      </TabsContent>
      
      {batchStatus === 'received' && (
        <>
          <TabsContent value="received" className="mt-4">
            <ItemsTableContent items={receivedItems} batchStatus={batchStatus} />
          </TabsContent>
          <TabsContent value="lost" className="mt-4">
            <ItemsTableContent items={lostItems} batchStatus={batchStatus} highlightIssues />
          </TabsContent>
          <TabsContent value="damaged" className="mt-4">
            <ItemsTableContent items={damagedItems} batchStatus={batchStatus} highlightIssues />
          </TabsContent>
        </>
      )}
    </Tabs>
  )
}

function ItemsTableContent({ 
  items, 
  batchStatus, 
  highlightIssues 
}: { 
  items: any[]
  batchStatus: string
  highlightIssues?: boolean
}) {
  const { t } = useTranslation(['laundry'])
  
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Package className="h-12 w-12 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">{t('batchItems.noItems')}</p>
      </div>
    )
  }
  
  return (
    <div className="rounded-md border">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t('batchItems.table.image')}</TableHead>
              <TableHead>{t('batchItems.table.item')}</TableHead>
              <TableHead className="text-center">{t('batchItems.table.deliveryQty')}</TableHead>
              <TableHead className="text-center">{t('batchItems.table.weight')}</TableHead>
              <TableHead>{t('batchItems.table.deliveryCondition')}</TableHead>
              {batchStatus === 'received' && (
                <>
                  <TableHead className="text-center">{t('batchItems.table.receivedQty')}</TableHead>
                  <TableHead className="text-center">{t('batchItems.table.lost')}</TableHead>
                  <TableHead className="text-center">{t('batchItems.table.damaged')}</TableHead>
                  <TableHead>{t('batchItems.table.receiveCondition')}</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const hasIssue = item.quantity_lost > 0 || item.quantity_damaged > 0
              
              return (
                <TableRow
                  key={item.id}
                  className={cn(
                    highlightIssues && hasIssue && 'bg-red-50'
                  )}
                >
                  <TableCell>
                    {item.item_thumbnail ? (
                      <img
                        src={item.item_thumbnail}
                        alt={item.item_name}
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
                      <Link 
                        to={`/items/${item.item_id}`}
                        className="font-medium hover:underline"
                      >
                        {item.item_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{item.item_code}</p>
                      {item.category_name && (
                        <Badge variant="outline" className="text-xs">
                          {item.category_name}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {item.quantity_delivered}
                  </TableCell>
                  <TableCell className="text-center">
                    {item.weight_kg} kg
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.condition_note || t('batchItems.condition.normal')}</Badge>
                  </TableCell>
                  {batchStatus === 'received' && (
                    <>
                      <TableCell className="text-center font-medium">
                        {item.quantity_returned}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.quantity_lost > 0 ? (
                          <span className="font-medium text-red-600">
                            {item.quantity_lost}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.quantity_damaged > 0 ? (
                          <span className="font-medium text-orange-600">
                            {item.quantity_damaged}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.return_condition === t('batchItems.condition.good') ? 'default' : 'secondary'
                          }
                        >
                          {item.return_condition || t('batchItems.condition.notChecked')}
                        </Badge>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}