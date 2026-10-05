#!/usr/bin/env node
// Audit extractor — quét codebase tạo JSON nguồn cho docs/architecture/_generated/
// Usage: node scripts/audit/extract-all.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/architecture/_generated');
fs.mkdirSync(OUT, { recursive: true });

// ---------- helpers ----------
const walk = (dir, filter = () => true, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'dist', '.lovable', '_generated'].includes(e.name)) continue;
      walk(p, filter, acc);
    } else if (filter(p)) acc.push(p);
  }
  return acc;
};
const readRel = (p) => ({ rel: path.relative(ROOT, p), text: fs.readFileSync(p, 'utf8') });
const tsx = (p) => /\.(tsx?|jsx?)$/.test(p);
const write = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2));

// ---------- 1. Routes ----------
// App.tsx dùng createBrowserRouter object form: { path: "...", element: <X /> }
// Một số route bọc <PermissionRoute module="..." action="..."> hoặc <RoleGuard>.
function extractRoutes() {
  const appFile = path.join(ROOT, 'src/App.tsx');
  if (!fs.existsSync(appFile)) return { routes: [], guards: [], source: 'src/App.tsx' };
  const text = fs.readFileSync(appFile, 'utf8');
  const routes = [];
  let m;

  // 1a. Object form: path: "x", element: <...>
  const objRe = /path:\s*["'`]([^"'`]+)["'`]\s*,\s*element:\s*([\s\S]*?)(?:,\s*(?:children|index|loader|errorElement)\s*:|}\s*[,)\]])/g;
  while ((m = objRe.exec(text))) {
    const path_ = m[1];
    const elemBlock = m[2];
    const guardMatch = elemBlock.match(/<(PermissionRoute|RoleGuard|ProtectedRoute|RequireAuth)\b([^>]*)>/);
    const compMatches = [...elemBlock.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map(x => x[1]);
    const skip = new Set(['PermissionRoute', 'RoleGuard', 'ProtectedRoute', 'RequireAuth', 'Navigate', 'Suspense']);
    const element = compMatches.find(n => !skip.has(n)) || compMatches[0] || null;
    routes.push({
      path: path_,
      element,
      guard: guardMatch ? guardMatch[1] : null,
      guardAttrs: guardMatch ? guardMatch[2].replace(/\s+/g, ' ').trim() : '',
    });
  }

  // 1b. JSX fallback: <Route path="x" element={<X/>} />
  const jsxRe = /<Route\s+([^>]+?)\/?>/g;
  while ((m = jsxRe.exec(text))) {
    const attrs = m[1];
    const path_ = (attrs.match(/path=["']([^"']+)["']/) || [])[1];
    const elem = (attrs.match(/element=\{<([A-Za-z0-9_]+)/) || [])[1];
    if (path_ || elem) routes.push({ path: path_ || null, element: elem || null, guard: null, guardAttrs: '' });
  }

  // 1c. Guards summary
  const guardRe = /<(PermissionRoute|RoleGuard|ProtectedRoute|RequireAuth)\s+([^>]+)>/g;
  const guards = [];
  while ((m = guardRe.exec(text))) {
    guards.push({ guard: m[1], attrs: m[2].replace(/\s+/g, ' ').trim() });
  }
  return { routes, guards, source: 'src/App.tsx' };
}

// ---------- 2. RPC calls ----------
function extractRpcs() {
  const files = walk(path.join(ROOT, 'src'), tsx);
  const calls = {};
  const re = /supabase\s*\.\s*rpc\(\s*['"`]([a-z0-9_]+)['"`]/gi;
  for (const f of files) {
    const { rel, text } = readRel(f);
    let m;
    while ((m = re.exec(text))) {
      const name = m[1];
      (calls[name] ||= []).push(rel);
    }
  }
  return Object.entries(calls)
    .map(([rpc, callers]) => ({ rpc, callers: [...new Set(callers)].sort() }))
    .sort((a, b) => a.rpc.localeCompare(b.rpc));
}

// ---------- 3. Tables ----------
function extractTables() {
  const files = walk(path.join(ROOT, 'src'), tsx);
  const usage = {};
  const fromRe = /\.from\(\s*['"`]([a-z0-9_]+)['"`]\s*\)/g;
  for (const f of files) {
    const { rel, text } = readRel(f);
    let m;
    while ((m = fromRe.exec(text))) {
      const t = m[1];
      const after = text.slice(m.index, m.index + 400);
      const ops = new Set();
      if (/\.select\(/.test(after)) ops.add('select');
      if (/\.insert\(/.test(after)) ops.add('insert');
      if (/\.update\(/.test(after)) ops.add('update');
      if (/\.delete\(/.test(after)) ops.add('delete');
      if (/\.upsert\(/.test(after)) ops.add('upsert');
      const entry = (usage[t] ||= { table: t, ops: new Set(), files: new Set() });
      ops.forEach((o) => entry.ops.add(o));
      entry.files.add(rel);
    }
  }
  return Object.values(usage)
    .map((e) => ({ table: e.table, ops: [...e.ops].sort(), files: [...e.files].sort() }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

// ---------- 4. Edge functions ----------
function extractEdgeFunctions() {
  const dir = path.join(ROOT, 'supabase/functions');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('_')) continue;
    const idx = path.join(dir, name, 'index.ts');
    if (!fs.existsSync(idx)) continue;
    const text = fs.readFileSync(idx, 'utf8');
    const secrets = [...text.matchAll(/Deno\.env\.get\(\s*['"`]([A-Z0-9_]+)['"`]\s*\)/g)].map((m) => m[1]);
    const description =
      (text.match(/\/\*\*([\s\S]*?)\*\//) || [])[1]?.trim().split('\n').slice(0, 3).join(' ') ||
      (text.match(/\/\/\s*(.+)/) || [])[1] ||
      '';
    out.push({
      name,
      file: path.relative(ROOT, idx),
      description: description.replace(/\s+/g, ' ').slice(0, 200),
      secrets: [...new Set(secrets)].sort(),
      lines: text.split('\n').length,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- 5. Hooks ----------
function extractHooks() {
  const dir = path.join(ROOT, 'src/hooks');
  if (!fs.existsSync(dir)) return [];
  const files = walk(dir, (p) => /use[A-Z][A-Za-z0-9]*\.tsx?$/.test(path.basename(p)));
  return files
    .map((f) => {
      const { rel, text } = readRel(f);
      const queryKeys = [...text.matchAll(/queryKey:\s*\[([^\]]+)\]/g)].map((m) =>
        m[1].replace(/\s+/g, ' ').slice(0, 100)
      );
      const rpcs = [...text.matchAll(/\.rpc\(\s*['"`]([a-z0-9_]+)['"`]/g)].map((m) => m[1]);
      const tables = [...text.matchAll(/\.from\(\s*['"`]([a-z0-9_]+)['"`]/g)].map((m) => m[1]);
      const invalidates = [...text.matchAll(/invalidateQueries\(\s*\{?\s*queryKey:\s*\[([^\]]+)\]/g)].map((m) =>
        m[1].replace(/\s+/g, ' ').slice(0, 100)
      );
      return {
        hook: path.basename(f, path.extname(f)),
        file: rel,
        queryKeys: [...new Set(queryKeys)],
        rpcs: [...new Set(rpcs)],
        tables: [...new Set(tables)],
        invalidates: [...new Set(invalidates)],
      };
    })
    .sort((a, b) => a.hook.localeCompare(b.hook));
}

// ---------- 6. Pages ----------
function extractPages() {
  const dir = path.join(ROOT, 'src/pages');
  const files = walk(dir, tsx);
  return files
    .map((f) => ({
      file: path.relative(ROOT, f),
      module: path.relative(path.join(ROOT, 'src/pages'), path.dirname(f)) || '_root',
      name: path.basename(f, path.extname(f)),
      lines: fs.readFileSync(f, 'utf8').split('\n').length,
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

// ---------- 7. Migrations summary ----------
function extractMigrations() {
  const dir = path.join(ROOT, 'supabase/migrations');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const tables = [...text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi)].map(
        (m) => m[1]
      );
      const fns = [...text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)/gi)].map(
        (m) => m[1]
      );
      const policies = [...text.matchAll(/create\s+policy\s+["']([^"']+)["']/gi)].map((m) => m[1]);
      return {
        file: f,
        tablesCreated: [...new Set(tables)],
        functionsCreated: [...new Set(fns)],
        policies: [...new Set(policies)],
        lines: text.split('\n').length,
      };
    });
}

// ---------- run ----------
console.log('Extracting...');
const data = {
  routes: extractRoutes(),
  rpcs: extractRpcs(),
  tables: extractTables(),
  edgeFunctions: extractEdgeFunctions(),
  hooks: extractHooks(),
  pages: extractPages(),
  migrations: extractMigrations(),
};
write('routes.json', data.routes);
write('rpc-calls.json', data.rpcs);
write('table-usage.json', data.tables);
write('edge-functions.json', data.edgeFunctions);
write('hooks.json', data.hooks);
write('pages.json', data.pages);
write('migrations.json', data.migrations);
// Đọc counts thực tế từ DB dump (nếu có) thay vì chỉ từ FE usage
function readDbTablesCount() {
  const f = path.join(OUT, 'db-rls-enabled.tsv');
  if (!fs.existsSync(f)) return null;
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
  return new Set(lines.map(l => l.split('\t')[0])).size;
}
function readDbViewsCount() {
  const columnsFile = path.join(OUT, 'db-columns.tsv');
  const tablesFile = path.join(OUT, 'db-rls-enabled.tsv');
  if (!fs.existsSync(columnsFile) || !fs.existsSync(tablesFile)) return null;
  const relations = new Set(
    fs.readFileSync(columnsFile, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => line.split('\t')[0])
  );
  const tables = new Set(
    fs.readFileSync(tablesFile, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => line.split('\t')[0])
  );
  return [...relations].filter((name) => !tables.has(name)).length;
}
function readDbRpcsCount() {
  return readAppRpcNames().length || null;
}
function readAppRpcNames() {
  // Đếm RPC do app định nghĩa = giao của db-functions.tsv ∩ functions created in migrations.
  const f = path.join(OUT, 'db-functions.tsv');
  if (!fs.existsSync(f)) return [];
  const dbNames = new Set(
    fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean)
      .map(l => l.split('\t')[0])
      .filter(n => n && !n.startsWith('_'))
  );
  // Lấy danh sách hàm được tạo trong migrations
  const appFns = new Set();
  for (const m of (data.migrations || [])) {
    for (const fn of (m.functionsCreated || [])) appFns.add(fn);
  }
  // Giao tập: hàm vừa có trong DB hiện tại vừa có trong migration của app
  return [...appFns].filter(n => dbNames.has(n)).sort();
}
function readDbRlsPolicyCount() {
  const f = path.join(OUT, 'db-policies.tsv');
  if (!fs.existsSync(f)) return null;
  // Policy expressions can contain newlines in older snapshots. Count only
  // complete TSV rows so stale snapshots do not inflate the architecture stats.
  return fs.readFileSync(f, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && line.split('\t').length >= 7)
    .length;
}

const dbTables = readDbTablesCount();
const dbViews = readDbViewsCount();
const dbRpcs = readDbRpcsCount();
const rlsPolicies = readDbRlsPolicyCount();
write('app-rpc-names.json', readAppRpcNames());

write('summary.json', {
  generatedAt: new Date().toISOString(),
  counts: {
    routes: data.routes?.routes?.length ?? 0,
    rpcs: dbRpcs ?? data.rpcs.length,
    rpcsCalledFromFE: data.rpcs.length,
    tables: dbTables ?? data.tables.length,
    views: dbViews,
    tablesUsedFromFE: data.tables.length,
    edgeFunctions: data.edgeFunctions.length,
    hooks: data.hooks.length,
    pages: data.pages.length,
    migrations: data.migrations.length,
    rlsPolicies: rlsPolicies ?? null,
  },
});
console.log('OK →', OUT);
console.log(JSON.stringify(JSON.parse(fs.readFileSync(path.join(OUT, 'summary.json'), 'utf8')), null, 2));
