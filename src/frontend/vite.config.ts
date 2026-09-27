import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

// `vite preview` serves the production build with the same headers as nginx so CSP issues surface locally.
const productionSecurityHeaders = Object.fromEntries(
  [...fs.readFileSync(path.resolve(__dirname, "security-headers.conf"), "utf8").matchAll(/^add_header\s+(\S+)\s+"([^"]*)"/gm)]
    .map(([, name, value]) => [name, value]),
);
if (!productionSecurityHeaders["Content-Security-Policy"]) {
  throw new Error("security-headers.conf must define a Content-Security-Policy add_header line.");
}

export default defineConfig({
  plugins: [
    react(),
    tailwind()
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: "localhost",
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: productionSecurityHeaders,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
