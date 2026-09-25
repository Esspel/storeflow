import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Disable prerendering globally - we use auth-dependent routes
      prerender: {
        enabled: false,
        // Force no routes to be prerendered
        /* routes: [], */
      },
      // Enable SPA to generate client HTML shell (index.html) for post-build script
      spa: {
        enabled: true,
      },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    react(),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("pdfjs-dist") || id.includes("pdf-parse")) return "vendor-pdf";
          if (id.includes("react") || id.includes("react-dom")) return "vendor-react";
          if (id.includes("recharts")) return "vendor-recharts";
          if (
            id.includes("@zxing") ||
            id.includes("@zxing/library") ||
            id.includes("@zxing/browser")
          )
            return "vendor-zxing";
          if (id.includes("supabase")) return "vendor-supabase";
          if (id.includes("date-fns")) return "vendor-date-fns";
          if (id.includes("xlsx")) return "vendor-xlsx";
          if (id.includes("lucide-react") || id.includes("lucide")) return "vendor-lucide";
          if (id.includes("jszip")) return "vendor-jszip";
          if (id.includes("node_modules")) return "vendor-misc";
        },
      },
    },
  },
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    tsconfigPaths: true,
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  server: {
    host: "::",
    port: 8080,
  },
  ssr: {
    noExternal: [
      // Externalize packages that don't work well in SSR
      "lucide-react",
      "@zxing/browser",
      "@zxing/library",
      "recharts",
      "sonner",
      "@radix-ui/react-popover",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-switch",
      "@radix-ui/react-label",
      "@radix-ui/react-slot",
      "@radix-ui/react-separator",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-avatar",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-menubar",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-slider",
      "@radix-ui/react-toast",
    ],
  },
});
