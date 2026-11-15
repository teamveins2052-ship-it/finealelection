import { defineConfig } from "vitest/config";

// Rules tests need the Firestore emulator: run via `npm run test:rules`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
