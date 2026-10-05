# API Routes (frontend)

160 routes trong `src/App.tsx`.

| Path | Element | Guard | Permission |
|---|---|---|---|
| `/landing` | `<LandingPage>` | – |  |
| `/auth/login` | `<Login>` | – |  |
| `/auth/register` | `<Register>` | – |  |
| `/auth/forgot-password` | `<ForgotPassword>` | – |  |
| `/auth/change-password` | `<AuthGuard>` | – |  |
| `/auth/callback` | `<AuthCallback>` | – |  |
| `/.lovable/oauth/consent` | `<OAuthConsent>` | – |  |
| `/unauthorized` | `<Unauthorized>` | – |  |
| `/payment-qr/:paymentId` | `<PaymentQRPage>` | – |  |
| `/i/:token` | `<InvoiceVatClaimPage>` | – |  |
| `/scan-document/:sessionId` | `<ScanDocumentPage>` | – |  |
| `/onboarding` | `<AuthGuard>` | – |  |
| `/settings/system-test` | `<AuthGuard>` | – |  |
| `/docs` | `<DocsLayout>` | RoleGuard | allowedRoles={['super_admin']} |
| `*` | `<DocsViewer>` | – |  |
| `/super-admin` | `<SuperAdminErrorBoundary>` | – |  |
| `dashboard` | `<Navigate>` | – |  |
| `tenants` | `<TenantsPage>` | – |  |
| `approval` | `<TenantApprovalPage>` | – |  |
| `promo-codes` | `<PromoCodesPage>` | – |  |
| `campaigns` | `<MarketingCampaignsPage>` | – |  |
| `campaigns/new` | `<NewCampaignPage>` | – |  |
| `reminders` | `<RenewalRemindersPage>` | – |  |
| `pricing` | `<PricingPlansPage>` | – |  |
| `payments` | `<PaymentSettingsPage>` | – |  |
| `analytics` | `<AnalyticsPage>` | – |  |
| `settings` | `<SuperAdminSettingsPage>` | – |  |
| `announcements` | `<AnnouncementsAdminPage>` | – |  |
| `/` | `<RootRoute>` | – |  |
| `more` | `<MorePage>` | – |  |
| `chat` | `<ChatPage>` | – |  |
| `chat/:conversationId` | `<ChatPage>` | – |  |
| `inventory` | `<InventoryDashboardPage>` | PermissionRoute | module="inventory" |
| `inventory/transactions` | `<InventoryHubRedirect>` | – |  |
| `inventory/inbound` | `<InventoryHubRedirect>` | – |  |
| `inventory/inbound/new` | `<InboundPage>` | PermissionRoute | module="inventory" action="create" |
| `inventory/outbound` | `<InventoryHubRedirect>` | – |  |
| `inventory/outbound/new` | `<OutboundPage>` | PermissionRoute | module="inventory" action="create" |
| `inventory/adjustments` | `<InventoryHubRedirect>` | – |  |
| `inventory/adjustments/new` | `<CreateAdjustmentPage>` | PermissionRoute | module="inventory" action="create" |
| `inventory/adjustments/:id` | `<AdjustmentDetailPage>` | PermissionRoute | module="inventory" |
| `inventory/adjustments/:id/check` | `<CheckAdjustmentPage>` | PermissionRoute | module="inventory" action="update" |
| `inventory/distributions` | `<InventoryHubRedirect>` | – |  |
| `inventory/transfer/new` | `<TransferPage>` | PermissionRoute | module="inventory" action="create" |
| `inventory/distributions/new` | `<InventoryHubRedirect>` | – |  |
| `inventory/distributions/from-supplements` | `<InventoryHubRedirect>` | – |  |
| `inventory/distributions/:id` | `<DistributionOrderDetailPage>` | PermissionRoute | module="inventory" |
| `inventory/reorder` | `<InventoryHubRedirect>` | – |  |
| `inventory/dead-stock` | `<InventoryHubRedirect>` | – |  |
| `inventory/analytics` | `<InventoryHubRedirect>` | – |  |
| `items` | `<InventoryHubRedirect>` | – |  |
| `items/:id` | `<ItemDetailPage>` | PermissionRoute | module="items" |
| `items/new` | `<ItemFormPage>` | PermissionRoute | module="items" action="create" |
| `items/:id/edit` | `<ItemFormPage>` | PermissionRoute | module="items" action="update" |
| `items/categories` | `<InventoryHubRedirect>` | – |  |
| `rooms` | `<RoomsPage>` | PermissionRoute | module="rooms" |
| `rooms/new` | `<RoomFormPage>` | PermissionRoute | module="rooms" action="create" |
| `rooms/:id` | `<RoomDetailPage>` | PermissionRoute | module="rooms" |
| `rooms/:id/edit` | `<RoomFormPage>` | PermissionRoute | module="rooms" action="update" |
| `rooms/:id/check` | `<RequireShiftRouteGate>` | PermissionRoute | module="rooms" action="update" |
| `rooms/:id/check-lean` | `<RequireShiftRouteGate>` | PermissionRoute | module="rooms" action="update" |
| `rooms/:id/check-lean/inspection` | `<RequireShiftRouteGate>` | PermissionRoute | module="rooms" action="update" |
| `rooms/:id/check-lean/review` | `<RequireShiftRouteGate>` | PermissionRoute | module="rooms" action="update" |
| `rooms/:id/check-lean/success` | `<RequireShiftRouteGate>` | PermissionRoute | module="rooms" action="update" |
| `rooms/:id/check-replenish` | `<RequireShiftRouteGate>` | PermissionRoute | module="rooms" action="update" |
| `rooms/:id/check-delivery` | `<RequireShiftRouteGate>` | PermissionRoute | module="rooms" action="update" |
| `rooms/standards` | `<RoomStandardsPage>` | PermissionRoute | module="rooms" |
| `supplements` | `<InventoryHubRedirect>` | – |  |
| `bookings` | `<BookingsPage>` | PermissionRoute | module="bookings" |
| `bookings/:id` | `<BookingDetailPage>` | PermissionRoute | module="bookings" |
| `guests` | `<GuestsPage>` | PermissionRoute | module="bookings" |
| `guests/:id` | `<GuestDetailPage>` | PermissionRoute | module="bookings" |
| `lost-found` | `<LostFoundPage>` | PermissionRoute | module="rooms" |
| `guest-invoices` | `<GuestInvoicesPage>` | PermissionRoute | module="bookings" |
| `finance/reconciliation` | `<ReconciliationPage>` | RoleGuard | allowedRoles={['super_admin', 'owner']} |
| `staff/shift-handover` | `<ShiftHandoverPage>` | – |  |
| `reception/pending-charges` | `<PendingChargesPage>` | PermissionRoute | module="bookings" |
| `laundry` | `<LaundryDashboardPage>` | PermissionRoute | module="laundry" |
| `laundry/batches` | `<LaundryBatchesPage>` | PermissionRoute | module="laundry" |
| `laundry/batches/new` | `<CreateBatchPage>` | PermissionRoute | module="laundry" action="create" |
| `laundry/batches/:id` | `<BatchDetailPage>` | PermissionRoute | module="laundry" |
| `laundry/batches/:id/receive` | `<ReceiveBatchPage>` | PermissionRoute | module="laundry" action="update" |
| `laundry/vendors` | `<VendorListPage>` | PermissionRoute | module="laundry" |
| `laundry/vendors/new` | `<VendorFormPage>` | PermissionRoute | module="laundry" action="create" |
| `laundry/vendors/:id` | `<VendorDetailPage>` | PermissionRoute | module="laundry" |
| `laundry/vendors/:id/edit` | `<VendorFormPage>` | PermissionRoute | module="laundry" action="update" |
| `laundry/compensation` | `<LaundryCompensationPage>` | PermissionRoute | module="laundry" |
| `laundry/linen-batches/new` | `<NewLinenBatchPage>` | PermissionRoute | module="laundry" action="create" |
| `settings` | `<SettingsRedirect>` | – |  |
| `settings/general` | `<GeneralSettingsPage>` | PermissionRoute | module="settings" |
| `settings/hotels` | `<HotelsManagementPage>` | PermissionRoute | module="hotels" |
| `settings/categories` | `<CategoryManagementPage>` | PermissionRoute | module="settings" |
| `settings/fixed-costs` | `<FixedCostsSettingsPage>` | PermissionRoute | module="settings" |
| `settings/users` | `<UsersPage>` | PermissionRoute | module="users" |
| `settings/change-password` | `<ChangePasswordPage>` | – |  |
| `staff` | `<StaffManagementPage>` | PermissionRoute | module="users" |
| `my-tasks` | `<MyTasksPage>` | – |  |
| `staff/housekeeping` | `<HousekeepingStaffDashboard>` | – |  |
| `housekeeping` | `<HousekeepingDashboardPage>` | PermissionRoute | module="rooms" |
| `housekeeping/review` | `<TasksPendingReviewPage>` | PermissionRoute | module="rooms" |
| `housekeeping/qc` | `<QcDashboardPage>` | PermissionRoute | module="rooms" |
| `housekeeping/issues-review` | `<IssuesReviewPage>` | RoleGuard | allowedRoles={['super_admin', 'owner', 'hotel_manager', 'dep |
| `settings/warehouses` | `<InventoryHubRedirect>` | – |  |
| `settings/subscription` | `<SubscriptionPage>` | RoleGuard | allowedRoles={['super_admin', 'owner']} |
| `settings/subscription/pay/:invoiceId` | `<SubscriptionPaymentPage>` | RoleGuard | allowedRoles={['super_admin', 'owner']} |
| `settings/usage` | `<UsageDashboardPage>` | RoleGuard | allowedRoles={['super_admin', 'owner']} |
| `settings/notifications` | `<NotificationSettingsPage>` | PermissionRoute | module="settings" |
| `settings/notifications/devices` | `<PushDevicesPage>` | PermissionRoute | module="settings" |
| `settings/telegram` | `<TelegramSettingsPage>` | PermissionRoute | module="settings" |
| `settings/business` | `<BusinessConfigurationPage>` | PermissionRoute | module="settings" |
| `settings/room-check` | `<RoomCheckSettingsPage>` | PermissionRoute | module="settings" |
| `settings/workflows` | `<WorkflowsPage>` | PermissionRoute | module="settings" action="manage" |
| `settings/pricing-rules` | `<Navigate>` | – |  |
| `settings/pricing` | `<PricingHubPage>` | PermissionRoute | module="settings" |
| `settings/pricing/seasonal` | `<Navigate>` | – |  |
| `legal/stay-registrations` | `<StayRegistrationsPage>` | PermissionRoute | module="bookings" |
| `settings/legal/stay-registration` | `<StayRegistrationSettingsPage>` | PermissionRoute | module="settings" |
| `settings/ai` | `<AISettingsPage>` | RoleGuard | allowedRoles={['super_admin', 'owner']} |
| `settings/audit-log` | `<AuditLogPage>` | RoleGuard | allowedRoles={['super_admin', 'owner', 'hotel_manager', 'dep |
| `settings/hotel-policy` | `<HotelPolicyPage>` | RoleGuard | allowedRoles={['super_admin', 'owner', 'hotel_manager']} |
| `profile` | `<ProfilePage>` | – |  |
| `settings/profile` | `<ProfilePage>` | – |  |
| `notifications` | `<NotificationHistoryPage>` | – |  |
| `help` | `<HelpPage>` | – |  |
| `whats-new` | `<WhatsNewPage>` | – |  |
| `reports` | `<OverviewHubPage>` | PermissionRoute | module="reports" |
| `reports/daily` | `<DailyReportPage>` | PermissionRoute | module="reports" |
| `reports/finance` | `<FinanceHubPage>` | PermissionRoute | module="reports" |
| `reports/operations` | `<OperationsHubPage>` | PermissionRoute | module="reports" |
| `reports/housekeeping` | `<HousekeepingHubPage>` | PermissionRoute | module="reports" |
| `reports/inventory` | `<InventoryHubPage>` | PermissionRoute | module="reports" |
| `reports/legacy` | `<Navigate>` | – |  |
| `reports/cash-flow` | `<Navigate>` | – |  |
| `reports/revenue` | `<Navigate>` | – |  |
| `reports/financial` | `<Navigate>` | – |  |
| `reports/rooms` | `<Navigate>` | – |  |
| `reports/damages` | `<Navigate>` | – |  |
| `reports/laundry` | `<Navigate>` | – |  |
| `reports/outbound` | `<Navigate>` | – |  |
| `reports/stock-audit` | `<Navigate>` | – |  |
| `reports/maintenance` | `<Navigate>` | – |  |
| `vendors` | `<VendorManagementListPage>` | PermissionRoute | module="vendors" |
| `vendors/new` | `<VendorManagementFormPage>` | PermissionRoute | module="vendors" action="create" |
| `vendors/:id` | `<VendorManagementDetailPage>` | PermissionRoute | module="vendors" |
| `vendors/:id/edit` | `<VendorManagementFormPage>` | PermissionRoute | module="vendors" action="update" |
| `vendors/compare` | `<VendorComparisonPage>` | PermissionRoute | module="vendors" |
| `maintenance` | `<MaintenanceDashboard>` | PermissionRoute | module="maintenance" |
| `maintenance/requests` | `<MaintenanceRequestList>` | PermissionRoute | module="maintenance" |
| `maintenance/requests/new` | `<MaintenanceRequestForm>` | PermissionRoute | module="maintenance" action="create" |
| `maintenance/requests/:id` | `<MaintenanceRequestDetail>` | PermissionRoute | module="maintenance" |
| `maintenance/requests/edit/:id` | `<MaintenanceRequestForm>` | PermissionRoute | module="maintenance" action="update" |
| `maintenance/recurring-issues` | `<RecurringIssuesPage>` | PermissionRoute | module="maintenance" |
| `purchase-orders` | `<POListPage>` | PermissionRoute | module="purchase_orders" |
| `purchase-orders/new` | `<POFormPage>` | PermissionRoute | module="purchase_orders" action="create" |
| `purchase-orders/:id` | `<PODetailPage>` | PermissionRoute | module="purchase_orders" |
| `hotels` | `<HotelsPage>` | PermissionRoute | module="hotels" |
| `hotels/performance` | `<HotelPerformancePage>` | PermissionRoute | module="hotels" |
| `users` | `<UsersPage>` | PermissionRoute | module="users" |
| `/dashboard` | `<Navigate>` | – |  |
| `*` | `<NotFound>` | – |  |

## Thống kê

- Có guard: **91/160**
- PermissionRoute với module: **82**
- Public (không guard): **69**

## Routes public (không có guard)

- `/landing` → `LandingPage`
- `/auth/login` → `Login`
- `/auth/register` → `Register`
- `/auth/forgot-password` → `ForgotPassword`
- `/auth/change-password` → `AuthGuard`
- `/auth/callback` → `AuthCallback`
- `/.lovable/oauth/consent` → `OAuthConsent`
- `/unauthorized` → `Unauthorized`
- `/payment-qr/:paymentId` → `PaymentQRPage`
- `/i/:token` → `InvoiceVatClaimPage`
- `/scan-document/:sessionId` → `ScanDocumentPage`
- `/onboarding` → `AuthGuard`
- `/settings/system-test` → `AuthGuard`
- `*` → `DocsViewer`
- `/super-admin` → `SuperAdminErrorBoundary`
- `dashboard` → `Navigate`
- `tenants` → `TenantsPage`
- `approval` → `TenantApprovalPage`
- `promo-codes` → `PromoCodesPage`
- `campaigns` → `MarketingCampaignsPage`
- `campaigns/new` → `NewCampaignPage`
- `reminders` → `RenewalRemindersPage`
- `pricing` → `PricingPlansPage`
- `payments` → `PaymentSettingsPage`
- `analytics` → `AnalyticsPage`
- `settings` → `SuperAdminSettingsPage`
- `announcements` → `AnnouncementsAdminPage`
- `/` → `RootRoute`
- `more` → `MorePage`
- `chat` → `ChatPage`
- `chat/:conversationId` → `ChatPage`
- `inventory/transactions` → `InventoryHubRedirect`
- `inventory/inbound` → `InventoryHubRedirect`
- `inventory/outbound` → `InventoryHubRedirect`
- `inventory/adjustments` → `InventoryHubRedirect`
- `inventory/distributions` → `InventoryHubRedirect`
- `inventory/distributions/new` → `InventoryHubRedirect`
- `inventory/distributions/from-supplements` → `InventoryHubRedirect`
- `inventory/reorder` → `InventoryHubRedirect`
- `inventory/dead-stock` → `InventoryHubRedirect`
- `inventory/analytics` → `InventoryHubRedirect`
- `items` → `InventoryHubRedirect`
- `items/categories` → `InventoryHubRedirect`
- `supplements` → `InventoryHubRedirect`
- `staff/shift-handover` → `ShiftHandoverPage`
- `settings` → `SettingsRedirect`
- `settings/change-password` → `ChangePasswordPage`
- `my-tasks` → `MyTasksPage`
- `staff/housekeeping` → `HousekeepingStaffDashboard`
- `settings/warehouses` → `InventoryHubRedirect`
- `settings/pricing-rules` → `Navigate`
- `settings/pricing/seasonal` → `Navigate`
- `profile` → `ProfilePage`
- `settings/profile` → `ProfilePage`
- `notifications` → `NotificationHistoryPage`
- `help` → `HelpPage`
- `whats-new` → `WhatsNewPage`
- `reports/legacy` → `Navigate`
- `reports/cash-flow` → `Navigate`
- `reports/revenue` → `Navigate`
- `reports/financial` → `Navigate`
- `reports/rooms` → `Navigate`
- `reports/damages` → `Navigate`
- `reports/laundry` → `Navigate`
- `reports/outbound` → `Navigate`
- `reports/stock-audit` → `Navigate`
- `reports/maintenance` → `Navigate`
- `/dashboard` → `Navigate`
- `*` → `NotFound`
