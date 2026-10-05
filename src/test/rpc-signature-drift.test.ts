/**
 * RPC Signature Drift Test
 *
 * Mục đích: chặn drift giữa chữ ký RPC trong DB (dump qua
 * `scripts/audit/dump-db-schema.sh` → `_generated/db-functions.tsv`) và
 * snapshot kỳ vọng (`scripts/audit/rpc-signatures.snapshot.json`).
 *
 * Khi test fail → dev phải:
 *   1. Đọc kỹ diff (test in ra expected vs actual).
 *   2. Quyết định: schema thay đổi hợp lệ → cập nhật snapshot + docs/architecture/01-modules/*.md
 *      tương ứng. Hoặc: drift sai → revert migration.
 *
 * Liên quan: docs/architecture/09-refactor/findings.md → F-RPC-OVERLOAD-01, F-RPC-DOC-01.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const TSV = path.join(ROOT, 'docs/architecture/_generated/db-functions.tsv');
const SNAPSHOT = path.join(ROOT, 'scripts/audit/rpc-signatures.snapshot.json');

interface Snapshot {
  expected: Record<string, string[]>;
}

function loadSnapshot(): Snapshot {
  return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) as Snapshot;
}

function loadDbFunctions(): Map<string, string[]> {
  if (!fs.existsSync(TSV)) {
    throw new Error(
      `Không tìm thấy ${path.relative(ROOT, TSV)}. Chạy: bash scripts/audit/dump-db-schema.sh`
    );
  }
  const map = new Map<string, string[]>();
  const lines = fs.readFileSync(TSV, 'utf8').trim().split('\n').filter(Boolean);
  for (const line of lines) {
    const [name, args] = line.split('\t');
    if (!name) continue;
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(args ?? '');
  }
  // Sort overloads để so sánh ổn định
  for (const arr of map.values()) arr.sort();
  return map;
}

/**
 * Chỉ lấy các RPC do app định nghĩa: SECURITY DEFINER (cột 5 = 't').
 * Lọc ra pgTAP / extension (secdef=f) để tránh false positive khi quét overload.
 */
function loadAppRpcs(): Map<string, string[]> {
  if (!fs.existsSync(TSV)) return new Map();
  const map = new Map<string, string[]>();
  const lines = fs.readFileSync(TSV, 'utf8').trim().split('\n').filter(Boolean);
  for (const line of lines) {
    const cols = line.split('\t');
    const name = cols[0];
    const args = cols[1] ?? '';
    const secdef = cols[4]; // 't' = SECURITY DEFINER (app RPC), 'f' = extension/pgTAP
    if (!name) continue;
    if (secdef !== 't') continue;
    if (name.startsWith('_')) continue; // helper riêng
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(args);
  }
  for (const arr of map.values()) arr.sort();
  return map;
}

describe('RPC signature drift (vs _generated/db-functions.tsv)', () => {
  const snapshot = loadSnapshot();
  const db = loadDbFunctions();
  const appRpcs = loadAppRpcs();

  for (const [rpc, expectedSigs] of Object.entries(snapshot.expected)) {
    it(`\`${rpc}\` khớp snapshot`, () => {
      const actual = db.get(rpc);
      if (!actual) {
        throw new Error(
          `RPC \`${rpc}\` không còn trong DB snapshot. Có thể đã bị DROP — ` +
            `cập nhật scripts/audit/rpc-signatures.snapshot.json + docs/architecture/01-modules/*.md.`
        );
      }
      const expectedSorted = [...expectedSigs].sort();
      // So sánh cả số lượng overload + nội dung từng arg string
      expect(actual, formatDiff(rpc, expectedSorted, actual)).toEqual(expectedSorted);
    });
  }

  it('không có overload mới của RPC critical chưa được snapshot', () => {
    // Cảnh báo nếu một RPC có trong snapshot bị thêm overload mới ngoài kế hoạch.
    const issues: string[] = [];
    for (const [rpc, expectedSigs] of Object.entries(snapshot.expected)) {
      const actual = db.get(rpc);
      if (!actual) continue;
      if (actual.length > expectedSigs.length) {
        issues.push(
          `\`${rpc}\`: DB có ${actual.length} overload, snapshot ${expectedSigs.length}. ` +
            `Thêm signature mới vào snapshot HOẶC DROP overload thừa.`
        );
      }
    }
    expect(issues, issues.join('\n')).toEqual([]);
  });

  it('không có overload trùng tên trong RPC app-defined (full scan, ngoài snapshot 13)', () => {
    // C1: scan TOÀN BỘ RPC do app định nghĩa (SECURITY DEFINER), không chỉ snapshot.
    // PostgREST chọn overload theo payload → 2 overload cùng tên = nguy cơ chọn nhầm.
    // Nếu hợp lệ → thêm vào ALLOWED_OVERLOADS với lý do rõ ràng.
    //
    // Chỉ giữ các overload bắt buộc cho tương thích nội bộ:
    // - is_super_admin(): được gọi trực tiếp trong các policy/RLS cũ.
    // - log_state_transition(): wrappers 4/5 args phục vụ các RPC legacy.
    // Các overload public khác phải được DROP hoặc hợp nhất trước khi merge.
    const ALLOWED_OVERLOADS = new Set<string>([
      'is_super_admin',
      'log_state_transition',
    ]);
    const offenders: string[] = [];
    for (const [name, sigs] of appRpcs.entries()) {
      if (sigs.length <= 1) continue;
      if (ALLOWED_OVERLOADS.has(name)) continue;
      offenders.push(
        `\`${name}\` có ${sigs.length} overload — DROP bớt hoặc thêm vào ALLOWED_OVERLOADS.\n` +
          sigs.map((s, i) => `    [${i}] ${s || '(no args)'}`).join('\n')
      );
    }
    expect(offenders, offenders.join('\n\n')).toEqual([]);
  });

  it('tổng số RPC trong DB không tụt bất thường (drift guard)', () => {
    // C1: số tổng nên ≥ baseline. Nếu tụt → có thể bị DROP nhầm.
    const BASELINE_MIN = 250; // 2026-05-10: actual = 283 sau khi drop submit_room_check_lean overload
    const total = Array.from(db.values()).reduce((a, arr) => a + arr.length, 0);
    expect(total, `RPC count = ${total} < baseline ${BASELINE_MIN}. Kiểm tra DROP nhầm?`).toBeGreaterThanOrEqual(BASELINE_MIN);
  });
});

function formatDiff(rpc: string, expected: string[], actual: string[]): string {
  const lines = [
    '',
    `RPC \`${rpc}\` drift so với snapshot.`,
    '',
    `Expected (${expected.length} overload):`,
    ...expected.map((s, i) => `  [${i}] ${s || '(no args)'}`),
    '',
    `Actual (${actual.length} overload trong db-functions.tsv):`,
    ...actual.map((s, i) => `  [${i}] ${s || '(no args)'}`),
    '',
    'Hành động:',
    '  - Nếu schema đổi hợp lệ → update scripts/audit/rpc-signatures.snapshot.json',
    '    + cập nhật docs/architecture/01-modules/*.md có nhắc tới chữ ký này.',
    '  - Nếu drift sai → revert migration / DROP overload thừa.',
    '',
  ];
  return lines.join('\n');
}
