import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  createCvAutoMiddleware,
  sharedCvWorkerManager,
} from "./server/cvAutoLocal.mjs";

const cvAutoPlugin = () => ({
  name: "local-cv-auto",
  configureServer(server) {
    const manager = sharedCvWorkerManager({ root: process.cwd() });
    server.middlewares.use(
      createCvAutoMiddleware({ root: process.cwd(), manager }),
    );
    server.httpServer?.once("close", () => manager.stop("server_closed"));
  },
  configurePreviewServer(server) {
    const manager = sharedCvWorkerManager({ root: process.cwd() });
    server.middlewares.use(
      createCvAutoMiddleware({ root: process.cwd(), manager }),
    );
    server.httpServer?.once("close", () => manager.stop("server_closed"));
  },
});

export default defineConfig({
  plugins: [react(), cvAutoPlugin()],
  optimizeDeps: { entries: ["index.html"] },
  server: { watch: { ignored: ["**/.cv-auto-runtime/**"] } },
  build: {
    sourcemap: false,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom")
          )
            return "react";
        },
      },
    },
  },
});
