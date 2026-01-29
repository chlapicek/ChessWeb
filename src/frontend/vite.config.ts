import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwind() // <-- add Tailwind plugin here
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"), // path alias
    },
  },
  css: {
    postcss: {}, // optional, but ensures Tailwind works
  },
});
