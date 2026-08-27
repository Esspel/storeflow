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
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("pdfjs-dist") || id.includes("pdf-parse")) return "vendor-pdf";
          if (id.includes("three") || id.includes("posemesh")) return "vendor-three";
          if (id.includes("react") || id.includes("react-dom")) return "vendor-react";
          if (id.includes("jszip") || id.includes("xlsx") || id.includes("lucide"))
            return "vendor-utils";
        },
      },
      external: [/^fs$/, /^path$/, /^crypto$/, /^posemesh/, /\/posemesh\//],
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
      "three",
      "@react-three/fiber",
      "@react-three/drei",
    ],
  },
  server: {
    host: "::",
    port: 8080,
  },
  ssr: {
    noExternal: [],
  },
});
