import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig(({ command }) => {
  const config = {
    plugins: [tsConfigPaths(), tanstackStart(), react(), tailwindcss()],
  };
  if (command === "build") {
    config.ssr = { noExternal: true };
  }
  return config;
});
