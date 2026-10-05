# Module: Reports

## Phạm vi
Báo cáo vận hành, doanh thu, kho, giặt ủi, bảo trì cho Owner/Manager. Real data only — không mock.

## Routes
| Path | Component | Permission |
|---|---|---|
| `/reports` | `ReportsDashboardPage` | `view_reports` |
| `/reports/inventory` | `InventoryReportPage` | `view_reports` |
| `/reports/financial` | Financial | `view_reports` |
| `/reports/laundry` | Laundry summary | `view_reports` |
| `/reports/stock-audit` | Stock audit | `view_reports` |
| `/reports/operations` | Operations KPI | `view_reports` |
| `/reports/rooms` | Room performance | `view_reports` |
| `/reports/maintenance` | Maintenance | `view_reports` |
| `/reports/outbound` | Outbound goods | `view_reports` |
| `/reports/revenue` | Revenue analytics | `view_reports` |
| `/reports/damages` | Damage report | `view_reports` |

## Nguồn dữ liệu
- `staff_statistics` — tổng hợp theo nhân viên/ca
- `tenant_usage` — usage subscription
- Aggregate views (TBD): `v_revenue_daily`, `v_room_occupancy`, `v_inventory_movement`
- Trực tiếp `room_bookings`, `payment_transactions`, `inventory_movements` với `tenant_id` filter

## Công thức tài chính
```
gross_revenue   = sum(booking.total_amount)
discount        = sum(booking.discount_amount)
commission      = sum(booking.ota_commission)
vat_passthrough = sum(booking.vat_amount) when vat_inclusive=false
net_revenue     = gross - discount - commission - vat_passthrough
```
Memory: `advanced-revenue-analytics-v1`, `dashboard/owner-and-mobile-metrics-spec`.

## Cache invalidation
Invalidate khi: booking checkout, payment success, inventory movement, distribution complete.
Query keys: `['reports', type, tenantId, hotelId, dateRange]`.

## Refactor cần thiết
- F-DBT-04: quote checkout đã được lưu authoritative ở DB trước payment; các
  báo cáo tài chính vẫn nên chuyển dần sang một DB view duy nhất để loại bỏ
  công thức trùng lặp ở client/server.
