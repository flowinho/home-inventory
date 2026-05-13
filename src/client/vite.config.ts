import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(process.cwd(), "src/client"),
  plugins: [react()],
  build: {
    outDir: resolve(process.cwd(), "dist/client"),
    emptyOutDir: true
  }
});
