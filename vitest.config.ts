import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Server-only modules are imported directly in unit tests; use the package's no-op build.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
});
