// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary"],
      // Like the CLI's: code that talks to processes and to VS Code.
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
