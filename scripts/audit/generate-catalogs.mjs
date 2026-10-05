#!/usr/bin/env node
// Sinh các bảng catalog tự động từ _generated/*.json
// Output: docs/architecture/04-contracts/{rpc-catalog,edge-functions,api-routes}.md
//         docs/architecture/02-data/{table-usage,rls-policies,erd-overview}.md
//         docs/architecture/07-frontend/{routing,hooks-catalog}.md
//         docs/architecture/08-ops/cron-jobs.md
import fs from 'node:fs';
import path from 'node:path';

const G = 'docs/architecture/_generated';
const A = 'docs/architecture';
const j = (n) => JSON.parse(fs.readFileSync(path.join(G, n), 'utf8'));
const tsv = (n) => fs.readFileSync(path.join(G, n), 'utf8').trim().split(/\r?\n/).map((l) => l.split('\t'));
const w = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// ===== 04-contracts/rpc-catalog.md =====
{
  const rpcCalls = j('rpc-calls.json'); // [{rpc, callers}]
  const fns = tsv('db-functions.tsv'); // proname, args, returns, lang, secdef
  const appRpcNames = new Set(fs.existsSync(path.join(G, 'app-rpc-names.json')) ? j('app-rpc-names.json') : []);
  const dbMap = new Map(fns.map((r) => [r[0], { args: r[1] || '', returns: r[2] || '', lang: r[3] || '', secdef: r[4] === 't' }]));
  const callMap = new Map(rpcCalls.map((r) => [r.rpc, r.callers]));

  // Union: tất cả RPC trong DB + tất cả được gọi
  const allNames = new Set([...dbMap.keys(), ...callMap.keys()]);
  const rows = [...allNames].sort().map((n) => {
    const d = dbMap.get(n);
    const callers = callMap.get(n) || [];
    return { name: n, args: d?.args ?? '_(không có trong DB hiện tại)_', returns: d?.returns ?? '–', lang: d?.lang ?? '–', secdef: d?.secdef ?? false, callers };
  });

  let md = `# RPC Catalog\n\n`;
  const appRows = rows.filter((r) => appRpcNames.has(r.name));
  const appUncalled = appRows.filter((r) => !r.callers.length);
  md += `**Public function names**: ${rows.length}. **App-defined RPC**: ${appRows.length}; ${appRows.filter(r => r.secdef).length} dùng SECURITY DEFINER; ${appUncalled.length} chưa có caller trực tiếp trong frontend (có thể được gọi từ trigger/edge/cron hoặc là dead code).\n\n`;
  md += `> Sinh tự động từ \`pg_proc\` + grep \`supabase.rpc()\`. Xem nguồn: \`_generated/db-functions.tsv\`, \`_generated/rpc-calls.json\`.\n\n`;
  md += `## Bảng tra cứu\n\n`;
  md += `| RPC | Args | Returns | Lang | SecDef | #Callers FE |\n|---|---|---|---|---|---|\n`;
  for (const r of rows) {
    const args = (r.args || '').replace(/\|/g, '\\|').slice(0, 80);
    const ret = (r.returns || '').replace(/\|/g, '\\|').slice(0, 40);
    md += `| \`${r.name}\` | ${args || '–'} | ${ret} | ${r.lang} | ${r.secdef ? '✓' : ''} | ${r.callers.length} |\n`;
  }
  md += `\n## Chi tiết caller\n\n`;
  for (const r of rows.filter(x => x.callers.length)) {
    md += `### \`${r.name}\`\n\n`;
    md += r.callers.map(c => `- \`${c}\``).join('\n') + '\n\n';
  }
  md += `\n## RPC không có caller frontend (cần kiểm tra)\n\n`;
  for (const r of appUncalled) {
    md += `- \`${r.name}\`(${(r.args || '').slice(0, 60)})\n`;
  }
  w(`${A}/04-contracts/rpc-catalog.md`, md);
}

// ===== 04-contracts/edge-functions.md =====
{
  const fns = j('edge-functions.json');
  let md = `# Edge Functions\n\n${fns.length} functions. Nguồn: \`supabase/functions/*/index.ts\`.\n\n`;
  md += `| Name | Lines | Secrets dùng | Mô tả |\n|---|---|---|---|\n`;
  for (const f of fns) {
    md += `| \`${f.name}\` | ${f.lines} | ${f.secrets.join(', ') || '–'} | ${(f.description || '').slice(0, 100)} |\n`;
  }
  md += `\n## Phân loại theo mục đích\n\n`;
  const cat = {
    'Payment': ['sepay-webhook', 'sync-sepay-transactions', 'expire-pending-payments'],
    'Auth / OTP': ['reset-password-with-otp', 'verify-otp', 'send-password-reset', 'create-user', 'update-user'],
    'Notifications': ['send-notification-email', 'send-push-notification', 'send-telegram-notification', 'send-welcome-email', 'send-invoice-email', 'telegram-webhook', 'notify-chargeable'],
    'Scan / OCR': ['scan-guest-document', 'mobile-scan-upload', 'get-scan-session', 'beeknoee-models'],
    'Cron / Background': ['check-shift-overtime', 'check-subscription-status', 'cleanup-sessions', 'dead-stock-digest', 'expire-pending-payments', 'laundry-compensation-cron', 'lift-expired-dnd-oos', 'process-room-check-outbox', 'reconcile-room-check-side-effects'],
    'Workflow': ['execute-workflow'],
  };
  for (const [c, names] of Object.entries(cat)) {
    md += `\n### ${c}\n\n`;
    for (const n of names) {
      const f = fns.find(x => x.name === n);
      if (f) md += `- **\`${n}\`** — ${f.description || ''} (secrets: ${f.secrets.join(', ') || 'none'})\n`;
    }
  }
  w(`${A}/04-contracts/edge-functions.md`, md);
}

// ===== 04-contracts/api-routes.md =====
{
  const routesData = j('routes.json');
  const routes = Array.isArray(routesData) ? routesData : (routesData?.routes || []);
  let md = `# API Routes (frontend)\n\n${routes.length} routes trong \`src/App.tsx\`.\n\n`;
  md += `| Path | Element | Guard | Permission |\n|---|---|---|---|\n`;
  for (const r of routes) {
    md += `| \`${r.path}\` | ${r.element ? `\`<${r.element}>\`` : '–'} | ${r.guard || '–'} | ${(r.guardAttrs || '').slice(0, 60)} |\n`;
  }
  // Stats
  const guarded = routes.filter(r => r.guard).length;
  const perm = routes.filter(r => r.guardAttrs?.includes('module=')).length;
  md += `\n## Thống kê\n\n- Có guard: **${guarded}/${routes.length}**\n- PermissionRoute với module: **${perm}**\n- Public (không guard): **${routes.length - guarded}**\n\n`;
  md += `## Routes public (không có guard)\n\n`;
  for (const r of routes.filter(r => !r.guard)) {
    md += `- \`${r.path}\` → \`${r.element}\`\n`;
  }
  w(`${A}/04-contracts/api-routes.md`, md);
}

// ===== 02-data/table-usage.md =====
{
  const tables = j('table-usage.json');
  const cols = tsv('db-columns.tsv');
  const colsByTable = new Map();
  for (const [t, col, type, nullable, def] of cols) {
    if (!colsByTable.has(t)) colsByTable.set(t, []);
    colsByTable.get(t).push({ col, type, nullable: nullable === 'YES', def });
  }
  const rls = new Map(tsv('db-rls-enabled.tsv').map((r) => [r[0], r[1] === 't']));
  const physicalTableNames = new Set(rls.keys());
  const viewCount = [...colsByTable.keys()].filter((name) => !physicalTableNames.has(name)).length;

  let md = `# Table Usage\n\n${tables.length} bảng/quan hệ được FE sử dụng / ${physicalTableNames.size} bảng vật lý trong DB`;
  if (viewCount) md += ` (+ ${viewCount} view)`;
  md += `.\n\n`;
  md += `| Table | RLS | #Cols | FE ops | #Files |\n|---|---|---|---|---|\n`;
  const all = [...new Set([...tables.map(t => t.table), ...colsByTable.keys()])].sort();
  for (const name of all) {
    const u = tables.find(t => t.table === name);
    const cs = colsByTable.get(name) || [];
    const r = rls.has(name) ? (rls.get(name) ? '✓' : '✗ **RLS OFF**') : '?';
    md += `| \`${name}\` | ${r} | ${cs.length} | ${u ? u.ops.join(', ') : '_(không dùng từ FE)_'} | ${u ? u.files.length : 0} |\n`;
  }
  // Find tables NOT used by FE (potential dead code or backend-only)
  const fePresent = new Set(tables.map(t => t.table));
  const notUsed = [...colsByTable.keys()].filter(t => !fePresent.has(t)).sort();
  md += `\n## Bảng không được gọi từ FE (${notUsed.length})\n\nCó thể: (a) backend-only / trigger, (b) dead code, (c) gọi qua RPC.\n\n`;
  notUsed.forEach(t => md += `- \`${t}\`\n`);
  w(`${A}/02-data/table-usage.md`, md);
}

// ===== 02-data/rls-policies.md =====
{
  const policies = tsv('db-policies.tsv');
  const rls = new Map(tsv('db-rls-enabled.tsv').map((r) => [r[0], r[1] === 't']));
  let md = `# RLS Policies\n\n${policies.length} policies trên ${new Set(policies.map(p => p[1])).size} tables.\n\n`;
  md += `## Tables KHÔNG bật RLS (${[...rls.entries()].filter(([_, v]) => !v).length})\n\n`;
  for (const [t, on] of rls) if (!on) md += `- \`${t}\` ⚠️\n`;
  md += `\n## Bảng × Policy\n\n`;
  const byTable = new Map();
  for (const [, t, name, cmd, roles, qual, withCheck] of policies) {
    if (!byTable.has(t)) byTable.set(t, []);
    byTable.get(t).push({ name, cmd, roles, qual, withCheck });
  }
  for (const [t, ps] of [...byTable.entries()].sort()) {
    md += `### \`${t}\` (${ps.length} policies)\n\n`;
    md += `| Policy | Cmd | Roles | USING | WITH CHECK |\n|---|---|---|---|---|\n`;
    for (const p of ps) {
      md += `| ${p.name} | ${p.cmd} | ${(p.roles || '').slice(0, 30)} | \`${(p.qual || '').replace(/\|/g, '\\|').slice(0, 80)}\` | \`${(p.withCheck || '').replace(/\|/g, '\\|').slice(0, 80)}\` |\n`;
    }
    md += '\n';
  }
  w(`${A}/02-data/rls-policies.md`, md);
}

// ===== 07-frontend/hooks-catalog.md =====
{
  const hooks = j('hooks.json');
  let md = `# Hooks Catalog\n\n${hooks.length} hooks. Nguồn: \`src/hooks/\`.\n\n`;
  md += `| Hook | RPC dùng | Bảng dùng | Query keys (mẫu) |\n|---|---|---|---|\n`;
  for (const h of hooks) {
    md += `| \`${h.hook}\` | ${h.rpcs.map(r => `\`${r}\``).join(', ') || '–'} | ${h.tables.map(t => `\`${t}\``).join(', ').slice(0, 60) || '–'} | ${(h.queryKeys[0] || '').slice(0, 50)} |\n`;
  }
  w(`${A}/07-frontend/hooks-catalog.md`, md);
}

// ===== 02-data/erd-overview.md =====
{
  const fks = tsv('db-fks.tsv').map(r => ({ tbl: r[0], col: r[1], refTbl: r[2], refCol: r[3] }));
  const cols = tsv('db-columns.tsv');
  const physicalTables = new Set(tsv('db-rls-enabled.tsv').map((r) => r[0]));
  const tablesSet = [...physicalTables].sort();
  const viewCount = new Set(cols.map(c => c[0])).size - tablesSet.length;
  // Group tables by domain prefix
  const groups = {
    'Tenant & Auth': ['tenants', 'hotels', 'users', 'user_roles', 'user_hotels', 'roles', 'permissions', 'role_permissions', 'positions', 'user_preferences'],
    'Bookings & Guests': ['room_bookings', 'booking_payments', 'booking_consumables', 'booking_service_charges', 'guests', 'pending_group_links', 'guest_invoices', 'invoices'],
    'Rooms & Housekeeping': ['rooms', 'room_types', 'room_type_standards', 'room_pricing_rules', 'room_items', 'room_checks', 'room_check_sessions', 'room_check_issues', 'housekeeping_tasks', 'lost_found_items'],
    'Inventory': ['items', 'item_categories', 'item_units', 'item_images', 'warehouses', 'warehouse_stock', 'inventory_transactions', 'distribution_orders', 'distribution_order_items', 'distribution_order_rooms', 'distribution_order_batches', 'stock_adjustments', 'stock_adjustment_items', 'reorder_suggestions', 'consumption_snapshots', 'chargeable_consumptions', 'investigation_logs'],
    'Laundry': ['laundry_batches', 'laundry_batch_items', 'laundry_categories', 'laundry_requests', 'laundry_vendors', 'compensation_requests', 'batch_inventory'],
    'Vendors & PO': ['vendors', 'purchase_orders', 'purchase_order_items', 'supplement_requests'],
    'Maintenance': ['maintenance_requests', 'maintenance_categories'],
    'Payment & Subscription': ['payment_transactions', 'bank_payment_settings', 'subscription_plans', 'plan_price_history', 'tenant_usage', 'renewal_reminders', 'reminder_automation_rules', 'reminder_email_templates', 'promotional_codes', 'promo_code_usage'],
    'Notifications & Workflows': ['notifications', 'in_app_notifications', 'email_notifications', 'push_subscriptions', 'notification_preferences', 'telegram_connections', 'telegram_groups', 'workflows', 'workflow_actions', 'workflow_executions'],
    'Operations': ['shift_history', 'staff_status', 'staff_statistics', 'activity_logs', 'backup_logs', 'super_admin_activity_log', 'platform_settings', 'marketing_campaigns', 'campaign_engagement', 'document_scan_sessions', 'checkout_inspection_requests', 'hotel_services', 'ai_settings', 'avatars'],
  };
  let md = `# ERD Overview\n\nMỗi domain có ERD riêng (xem các file \`erd-*.md\`). File này là bản đồ tổng + Mermaid theo domain.\n\n`;
  md += `**Tổng: ${tablesSet.length} bảng vật lý, ${fks.length} foreign key`;
  if (viewCount) md += `, ${viewCount} view`;
  md += `.**\n\n`;
  for (const [g, tabs] of Object.entries(groups)) {
    const present = tabs.filter(t => tablesSet.includes(t));
    if (!present.length) continue;
    md += `## ${g}\n\n`;
    md += '```mermaid\nerDiagram\n';
    for (const t of present) md += `  ${t} {\n    uuid id PK\n  }\n`;
    for (const t of present) {
      for (const fk of fks.filter(f => f.tbl === t && present.includes(f.refTbl))) {
        md += `  ${fk.refTbl} ||--o{ ${fk.tbl} : "${fk.col}"\n`;
      }
    }
    md += '```\n\n';
  }
  // Orphans
  const grouped = new Set(Object.values(groups).flat());
  const orphans = tablesSet.filter(t => !grouped.has(t));
  if (orphans.length) {
    md += `## Bảng chưa phân nhóm (${orphans.length})\n\n` + orphans.map(t => `- \`${t}\``).join('\n') + '\n';
  }
  w(`${A}/02-data/erd-overview.md`, md);
}

// ===== 08-ops/cron-jobs.md =====
{
  const fns = j('edge-functions.json');
  const cronCandidates = fns.filter(f => /cron|expire|cleanup|reconcile|reminder|digest|lift|check-/.test(f.name));
  let md = `# Cron Jobs\n\n> ⚠️ Schema \`cron\` không cấp quyền đọc cho session hiện tại — danh sách dưới đây suy ra từ tên Edge Function. Cần xác nhận lại trong dashboard.\n\n## Edge functions có hành vi định kỳ\n\n`;
  for (const f of cronCandidates) {
    md += `- **\`${f.name}\`** — ${f.description || ''}\n`;
  }
  md += `\n## Cần ghi rõ schedule (TODO)\n\n| Function | Schedule (giả định) | Mục đích |\n|---|---|---|\n`;
  md += `| \`expire-pending-payments\` | \`*/5 * * * *\` | Hủy QR thanh toán quá hạn |\n`;
  md += `| \`check-subscription-status\` | \`0 1 * * *\` | Đánh dấu suspended/grace |\n`;
  md += `| \`check-shift-overtime\` | \`*/15 * * * *\` | Cảnh báo ca làm quá giờ |\n`;
  md += `| \`cleanup-sessions\` | \`0 3 * * *\` | Xóa session scan cũ |\n`;
  md += `| \`dead-stock-digest\` | \`0 8 * * 1\` | Báo dead stock hàng tuần |\n`;
  md += `| \`laundry-compensation-cron\` | \`0 9 * * *\` | Auto chốt compensation |\n`;
  md += `| \`lift-expired-dnd-oos\` | \`*/10 * * * *\` | Auto lift DND/OOS hết hạn |\n`;
  md += `| \`process-room-check-outbox\` | \`* * * * *\` | Fan-out side effects sau room check |\n`;
  md += `| \`reconcile-room-check-side-effects\` | \`*/30 * * * *\` | Bù trừ side effect lỗi |\n`;
  w(`${A}/08-ops/cron-jobs.md`, md);
}

console.log('Generated catalogs ✓');
