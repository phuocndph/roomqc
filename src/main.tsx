import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n";
import { installChunkReloadHandler } from "./lib/chunk-reload";
import { resolveWorkspace } from './lib/workspace';
import { configureWorkspace } from './lib/runtime-config';
import { prepareNativeApp } from './lib/native/bootstrap';

// Cài đặt handler bắt lỗi chunk-load (deploy mới → hash cũ) TRƯỚC khi render.
installChunkReloadHandler();

const root = createRoot(document.getElementById('root')!);
root.render(<div role="status" className="min-h-screen flex items-center justify-center">Đang mở RoomQC…</div>);

async function start() {
  try {
    await prepareNativeApp();
    configureWorkspace(await resolveWorkspace());
    // All modules importing the singleton must load after trusted bootstrap.
    const { default: App } = await import('./App.tsx');
    root.render(<App />);
  } catch (error) {
    root.render(<main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Chưa thể mở doanh nghiệp</h1>
      <p role="alert">{error instanceof Error ? error.message : 'Vui lòng thử lại sau.'}</p>
      <button className="rounded bg-blue-700 px-5 py-2 text-white" onClick={() => window.location.reload()}>Thử lại</button>
      <a href="/start?mode=login">Chọn doanh nghiệp khác</a>
      <a href="/start">Mở đăng ký doanh nghiệp</a>
    </main>);
  }
}
void start();
