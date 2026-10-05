export interface DateRange {
  start: Date
  end: Date
}

export interface ReportFilters {
  dateRange: DateRange
  hotelId?: string
  categoryId?: string
  compareToPrevious?: boolean
}

export interface InventoryReportData {
  summary: {
    total_value: number
    total_items: number
    total_types: number
    low_stock_count: number
    out_of_stock_count: number
    utilization_rate: number
    avg_days_in_stock: number
  }
  by_category: Array<{
    category_id: string
    category_name: string
    category_color: string
    item_count: number
    total_stock: number
    in_use: number
    in_laundry: number
    total_value: number
    percentage: number
  }>
  top_items_by_value: Array<{
    item_id: string
    item_name: string
    item_code: string
    category: string
    quantity: number
    unit_price: number
    total_value: number
    percentage: number
  }>
  stock_status_distribution: {
    in_stock: number
    in_use: number
    in_laundry: number
    damaged: number
    lost: number
  }
  transaction_summary: {
    total_transactions: number
    inbound_count: number
    outbound_count: number
    inbound_value: number
    outbound_value: number
    net_change_value: number
  }
}

export interface FinancialReportData {
  summary: {
    total_cost: number
    purchase_cost: number
    laundry_cost: number
    maintenance_cost: number
  }
  monthly_trend: Array<{
    month: string
    purchase: number
    laundry: number
    maintenance: number
  }>
  cost_by_category: Array<{
    category: string
    cost: number
  }>
}

export interface ABCAnalysisItem {
  item_id: string
  item_code: string
  item_name: string
  category_name: string
  total_value: number
  cumulative_value: number
  percentage: number
  cumulative_percentage: number
  abc_class: 'A' | 'B' | 'C'
}

export interface TurnoverAnalysisItem {
  item_id: string
  item_code: string
  item_name: string
  category_name: string
  avg_stock: number
  total_usage: number
  turnover_rate: number
  days_in_stock: number
  status: 'fast' | 'medium' | 'slow'
}

export interface LaundryReportData {
  summary: {
    total_batches: number
    total_items: number
    total_weight: number
    total_cost: number
    avg_cost_per_batch: number
    avg_cost_per_kg: number
    avg_quality: number
    avg_timeliness: number
    on_time_rate: number
  }
  by_vendor: Array<{
    vendor_id: string
    vendor_name: string
    batches: number
    items: number
    weight: number
    cost: number
    cost_per_kg: number
    quality: number
    on_time_rate: number
    issues: number
  }>
  monthly_trend: Array<{
    month: string
    batches: number
    items: number
    cost: number
    quality?: number
    timeliness?: number
  }>
  period_comparison: {
    current: {
      batches: number
      items: number
      cost: number
      avg_quality: number
    }
    previous: {
      batches: number
      items: number
      cost: number
      avg_quality: number
    }
  }
  processing_stats: {
    avg_days: number
    min_days: number
    max_days: number
    on_time_count: number
    late_count: number
  }
  items_analysis: Array<{
    item_id: string
    item_code: string
    item_name: string
    category_name: string
    total_washed: number
    total_weight_kg: number
    total_damaged: number
    total_lost: number
    estimated_cost: number
  }>
  damage_breakdown: {
    total_damage_value: number
    damage_rate: number
    by_item: Array<{
      item_name: string
      damaged: number
      lost: number
      value: number
    }>
  }
  cost_optimization: {
    cheapest_vendor: {
      name: string
      cost_per_kg: number
    } | null
    most_expensive_vendor: {
      name: string
      cost_per_kg: number
    } | null
    potential_monthly_savings: number
  }
}

export interface ReportSchedule {
  id: string
  report_type: string
  frequency: 'daily' | 'weekly' | 'monthly'
  time: string
  recipients: string[]
  filters: any
  format: 'pdf' | 'excel' | 'both'
  active: boolean
  last_sent?: Date
}
