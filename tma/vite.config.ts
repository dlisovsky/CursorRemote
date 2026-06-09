import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));
const apiPort = process.env.PORT ?? "4871";
const devPort = Number(process.env.VITE_DEV_PORT ?? 5187);
const apiOrigin = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  root,
  envDir: path.join(root, ".."),
  server: {
    port: devPort,
    strictPort: true,
    proxy: {
      "/auth": apiOrigin,
      "/projects": apiOrigin,
      "/agents": { target: apiOrigin, ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
