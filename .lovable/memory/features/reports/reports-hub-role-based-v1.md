---
name: reports-hub-role-based-v1
description: Sprint A — /reports tổ chức theo section + lọc theo role/department, catalog tập trung tại reportsCatalog.ts
type: feature
---

# Reports Hub Role-based v1 (Sprint A)

## Catalog tập trung
- File: `src/lib/reportsCatalog.ts` — single source of truth cho 10 báo cáo.
- 6 section theo thứ tự: `finance`, `operations`, `housekeeping`, `inventory`, `laundry`, `maintenance`.
- Mỗi `ReportDefinition` có: `roles[]` (legacy AppRole) + `departments[]` (chỉ áp dụng cho `department_manager`).

## Quy tắc lọc (`filterReportsForUser`)
- `super_admin` / `owner` / `hotel_manager`: thấy toàn bộ trong section của mình.
- `department_manager`: chỉ thấy báo cáo mà `departments` chứa `positions.department` của user. Không có department → mảng rỗng.
- `staff`: không thấy báo cáo nào (route `/reports` cũng đã chặn).

## Export quyền (`canExportReport`)
- Owner / Hotel Manager: export mọi báo cáo.
- Department Manager: chỉ export báo cáo bộ phận mình.
- Staff: không bao giờ export.

## Hook tiêu thụ
`src/hooks/useAccessibleReports.ts` — đọc `useUser` → `role` + `position.department`, trả `{ sections, reports, canExport }`.

## UI
- `src/pages/reports/ReportsDashboardPage.tsx` (desktop) và `src/components/reports/MobileReportsDashboard.tsx` (mobile) đều render theo `sections` của hook.
- Section header: `text-xs uppercase tracking-wide text-muted-foreground` + border-bottom.
- Hiển thị nhãn vai trò ("Trưởng buồng phòng", "Quản lý khách sạn"...) cạnh tên hotel.
- Khi `sections.length === 0`: empty state hướng dẫn liên hệ quản trị.

## Lưu ý mở rộng
- Khi thêm báo cáo mới: chỉ cần `push` vào `REPORTS_CATALOG`, set đúng `section` + `roles` + (nếu cần) `departments`.
- Khi thêm department mới: cập nhật type `DepartmentCode` + map nhãn trong `ReportsDashboardPage` & `MobileReportsDashboard`.
- Sprint B-D (HK Productivity, QC Quality, Front Office, CRM, Chain Overview) sẽ chỉ cần thêm entry vào catalog + page; không phải sửa hub.

## Tests
`src/lib/reportsCatalog.test.ts` — 14 test cases bao phủ filter + group + export cho mọi role/department.

## Quyết định scope
- Không thêm department `front_office` (Lễ tân) — gộp vào hotel_manager.
- Không build "My Tasks Report" cho staff trong sprint này.
- Chưa có Chain view / Front Office / Guest CRM (Sprint C-D).
