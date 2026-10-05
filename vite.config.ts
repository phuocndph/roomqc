import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

function roomQcHtmlSecurityPlugin(rawSupabaseUrl: string | undefined): Plugin {
  let origin: string | null = null;
  let connectSources = "https://*.supabase.co wss://*.supabase.co";

  if (rawSupabaseUrl) {
    try {
      const parsed = new URL(rawSupabaseUrl);
      origin = parsed.origin;
      const websocketProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      connectSources = `${origin} ${websocketProtocol}//${parsed.host}`;
    } catch {
      throw new Error("VITE_SUPABASE_URL must be a valid absolute URL");
    }
  }

  return {
    name: "roomqc-html-security",
    transformIndexHtml(html) {
      const transformed = html.replaceAll("__ROOMQC_SUPABASE_CONNECT_SRC__", connectSources);

      if (!origin) {
        return transformed.replace(/\s*<link data-roomqc-supabase-origin[^>]*>\s*/g, "\n");
      }

      return transformed.replaceAll("__ROOMQC_SUPABASE_ORIGIN__", origin);
    },
  };
}


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return ({
  server: {
    host: "::",
    // Keep RoomQC separate from CRM-JolieFam (8080) and Hotel Data Engine (8081).
    port: 8082,
    strictPort: true,
  },
  preview: {
    host: "::",
    port: 8082,
    strictPort: true,
  },
  // Drop console.log + debugger in production builds (~395 logs were running in prod).
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  plugins: [
    react(), 
    roomQcHtmlSecurityPlugin(env.VITE_SUPABASE_URL),
    mcpPlugin(),
    mode === "development" && componentTagger(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'RoomQc - Quản lý khách sạn',
        short_name: 'RoomQc',
        description: 'Hệ thống quản lý khách sạn toàn diện',
        theme_color: '#1a202c',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-72x72.png', sizes: '72x72', type: 'image/png' },
          { src: '/icon-96x96.png', sizes: '96x96', type: 'image/png' },
          { src: '/icon-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icon-152x152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-384x384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        globIgnores: [
          '**/wasm-*.js',
          '**/*.wasm',
          '**/changelog.json',
          '**/vendor-*.js',
          '**/index.html',
          '**/*.html',
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },

      devOptions: {
        enabled: false,
        type: 'module',
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // A stale hashed bundle may otherwise survive between builds and retain an
    // obsolete Supabase URL even though index.html no longer references it.
    emptyOutDir: true,
    cssCodeSplit: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Gộp toàn bộ node_modules vào MỘT chunk `vendor` duy nhất.
        // Mọi nỗ lực tách (react/radix, markdown/excel) đều dẫn tới TDZ /
        // circular import giữa chunk con trên production
        // (forwardRef undefined, "Cannot access 'it' before initialization").
        // Trade-off: vendor lớn hơn, nhưng cache theo content hash + gzip.
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
  });
});
