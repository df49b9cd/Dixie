import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "node:events": resolve(__dirname, "src/test.node-events-shim.ts")
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test.setup.ts"]
  }
});
