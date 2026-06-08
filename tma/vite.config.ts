import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root,
  envDir: path.join(root, ".."),
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:3847",
      "/projects": "http://localhost:3847",
      "/agents": "http://localhost:3847",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
