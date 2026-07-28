import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    exclude: ["node_modules", "dist"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
