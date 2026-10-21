// SPDX-License-Identifier: Apache-2.0
// Bundles the CLI and its dependencies into one ESM file: users install nothing else and
// hooks start fast.
import { build } from "esbuild";

await build({
  entryPoints: { specty: "src/main.ts" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Prefer ESM entries: jsonc-parser's UMD build uses dynamic requires that cannot be bundled.
  mainFields: ["module", "main"],
  legalComments: "eof",
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __specty_createRequire } from 'node:module';",
      "const require = __specty_createRequire(import.meta.url);",
    ].join("\n"),
  },
});
