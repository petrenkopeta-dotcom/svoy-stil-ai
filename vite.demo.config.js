import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "demo", base: "./", publicDir: false, envDir: false,
  plugins: [react()],
  build: { outDir: "../dist-demo", emptyOutDir: true, sourcemap: false, modulePreload: { polyfill: false } },
});
