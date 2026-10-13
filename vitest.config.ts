import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["app/lib/**", "app/features/**"],
      exclude: ["**/*.test.ts"],
    },
  },
});
