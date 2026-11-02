import js from "@eslint/js";
import tseslint from "typescript-eslint";

const NODE_BUILTINS = [
  "assert", "buffer", "child_process", "cluster", "crypto", "dns", "events", "fs", "http", "http2",
  "https", "net", "os", "path", "perf_hooks", "readline", "stream", "tls", "url", "util", "vm",
  "worker_threads", "zlib",
];

const FORBIDDEN_GLOBALS = [
  // Node-only
  "process", "Buffer", "__dirname", "__filename", "require", "module", "global",
  // DOM-only
  "window", "document", "navigator", "localStorage", "sessionStorage", "location", "history",
  "HTMLElement", "Element", "Node", "XMLHttpRequest", "alert",
].map((name) => ({ name, message: "Shared packages must stay free of Node-only and DOM-only APIs (ADR 0004)." }));

export default tseslint.config(
  { ignores: ["**/node_modules", "**/.next", "**/dist", "**/drizzle", "**/test-results", "**/playwright-report", "apps/web/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/domain/src/**/*.ts", "packages/api-client/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-globals": ["error", ...FORBIDDEN_GLOBALS],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^node:", message: "Node-only module; not allowed in shared packages." },
            { regex: `^(${NODE_BUILTINS.join("|")})(/.*)?$`, message: "Node-only module; not allowed in shared packages." },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^drizzle-orm(/.*)?$", message: "Route handlers go through src/server modules, never Drizzle directly." },
            { regex: "(^|/)server/db/schema$", message: "Route handlers go through src/server modules, never the Drizzle schema directly." },
          ],
        },
      ],
    },
  },
);
