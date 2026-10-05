---
name: Chunk Load Auto-Reload
description: Global handler + ErrorBoundary tự xoá SW/caches + reload khi gặp lỗi "Importing a module script failed" sau deploy
type: feature
---
**Vấn đề:** Sau deploy, index.html cũ (cache SW/browser) tham chiếu chunk hash đã xóa → lazy import fail → user kẹt màn lỗi.

**Giải pháp:**
- `src/lib/chunk-reload.ts` — `installChunkReloadHandler()` gọi từ `main.tsx` trước khi render. Bắt `error` + `unhandledrejection`, match regex chunk error, `sessionStorage.__chunk_reload_attempted__` chống loop (1 lần/session), purge `caches` + unregister SW + `location.replace(?__r=ts)`.
- `src/components/ChunkErrorBoundary.tsx` — bọc `<Suspense>` trong `App.tsx`. Nếu chunk error → auto reload + show "Đã có bản cập nhật mới / Tải lại ngay". Lỗi khác → fallback thường.

**Quy tắc:** Không xoá `installChunkReloadHandler()` khỏi `main.tsx`. Mọi route lazy trong App.tsx phải nằm trong `<ChunkErrorBoundary>`.
