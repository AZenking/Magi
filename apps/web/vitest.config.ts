import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    // Playwright specs have their own `test:e2e` command and must not be
    // loaded by Vitest (otherwise Playwright's test.describe executes during
    // Vitest collection and fails before any unit test runs).
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
