---
name: Operations Insights Tab v1
description: Tab "Đánh giá vận hành" trong /reports/financial — KPI + benchmark + Hybrid Rule/AI advice
type: feature
---

# Operations Insights (Đánh giá vận hành) v1

## Vị trí
Tab mặc định trong `/reports/financial`. Tab thứ 2 là "Chi phí" (overview cũ).

## Files
- `src/lib/industryBenchmarks.ts` — thresholds VN 2-4 sao (occupancy, profitMargin, revpar, adr, extraRevenueShare, laundryCostPerRoom). `classifyBenchmark()` trả 4 mức.
- `src/lib/operationsAdvisor.ts` — `computeDerivedKpis()` + `runOperationsAdvisor()` (10 rules) + `sortFindings()`. Pure functions.
- `src/hooks/useOperationsInsights.ts` — gom revenue + financial + room-nights; `useOperationsAdvice()` gọi edge function.
- `src/components/reports/insights/{KpiHeroCard,BenchmarkBadge,AdviceCard,InsightsTrendChart,ExportInsightsPdfButton}.tsx`
- `src/pages/reports/components/OperationsInsightsTab.tsx`
- `supabase/functions/operations-advisor/index.ts` — Lovable AI Gateway, model `google/gemini-3-flash-preview`, tool calling structured output.

## KPI formulas (xem operationsAdvisor.ts)
- profit = netRevenue − totalCost
- occupancy = roomNightsSold / (totalRooms × periodDays)
- revpar = netRevenue / (totalRooms × periodDays)
- adr = netRevenue / roomNightsSold
- extraRevenueShare = (service + extra charges) / grossRevenue
- laundryCostPerRoom normalized về 30 ngày

## Fallback
Nếu edge function 402/429/lỗi → render top-5 rule findings thay vì AI advice. Không vỡ trang.

## PDF Export
jsPDF + `stripDiacritics()` (font Latin built-in không hỗ trợ tiếng Việt có dấu).
