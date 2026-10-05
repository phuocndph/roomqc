export interface StockAuditReportData {
  summary: {
    total_audits: number
    total_items_checked: number
    match_count: number
    discrepancy_count: number
    accuracy_rate: number
    total_discrepancy_value: number
    total_shortage_qty: number
    total_excess_qty: number
  }
  audits_list: Array<{
    id: string
    adjustment_code: string
    adjustment_type: string
    status: string
    scheduled_date: string
    completed_at: string | null
    approved_at: string | null
    created_by_name: string
    items_count: number
    match_count: number
    discrepancy_count: number
    adjustment_value: number
  }>
  discrepancy_by_category: Array<{
    category_id: string
    category_name: string
    category_color: string
    shortage_qty: number
    excess_qty: number
    adjustment_value: number
    audit_count: number
  }>
  monthly_trend: Array<{
    month: string
    audits: number
    items_checked: number
    accuracy_rate: number
    adjustment_value: number
  }>
  investigation_summary: {
    total_investigations: number
    resolved_count: number
    pending_count: number
    compensation_total: number
    compensation_collected: number
  }
}
