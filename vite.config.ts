import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude],
    include: ["tests/unit/**/*.test.ts"]
  }
})
