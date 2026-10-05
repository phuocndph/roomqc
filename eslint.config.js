import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import lovableInternal from "./eslint-rules/index.js";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "eslint-rules/**",
      // Vite/Vitest creates these transient config bundles. Ignoring them
      // prevents ENOENT races when lint and tests run at the same time.
      "**/*.timestamp-*.mjs",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "lovable-internal": lovableInternal,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", {
        allowConstantExport: true,
        // These modules intentionally co-locate reusable hooks/configuration
        // with their UI component; the exports are not component state.
        allowExportNames: [
          "useTheme", "useCanAccess", "useChatPopups", "useChatPopupsOptional",
          "ORDER_STATUS_CONFIG", "ROOM_STATUS_CONFIG", "getQuantityStatus",
          "validateLaundryData", "PAPER_SIZES", "PAPER_CONFIG", "useQRExpiry",
          "getCategoryColor", "groupItemsByCategory", "LEAN_TEXT",
          "DEPARTMENTS", "GROUP_TYPES", "NOTIFICATION_TYPES",
          "CATEGORY_LABELS", "WORKFLOW_TEMPLATES", "badgeVariants",
          "buttonVariants", "useFormField", "navigationMenuTriggerStyle",
          "sidebarMenuButtonVariants", "toast", "toggleVariants", "useAuth",
          "useHotelContext", "useRequireShift", "useSidebar", "clearLeanDraft",
        ],
      }],
      // The existing application and Edge Functions intentionally use dynamic
      // Supabase payloads; keep this debt visible without blocking deploys.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      // F-FSM-01/02: chặn update trực tiếp status của rooms / room_bookings / housekeeping_tasks
      "lovable-internal/no-direct-room-status-update": "error",
    },
  },
);
