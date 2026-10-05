import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { installChunkReloadHandler } from "./lib/chunk-reload";

// Cài đặt handler bắt lỗi chunk-load (deploy mới → hash cũ) TRƯỚC khi render.
installChunkReloadHandler();

createRoot(document.getElementById("root")!).render(<App />);
