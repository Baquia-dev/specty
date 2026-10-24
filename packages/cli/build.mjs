// SPDX-License-Identifier: Apache-2.0
// Bundles the CLI and its dependencies into one ESM file: users install nothing else and
// hooks start fast. `--ui <folder>` copies a build of the UI next to it, for the npm package;
// `--outdir <folder>` writes somewhere else than `dist`.
import { access, cp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const { values } = parseArgs({
  options: { ui: { type: "string" }, outdir: { type: "string", default: "dist" } },
});
const outdir = values.outdir;

await build({
  entryPoints: { specty: "src/main.ts" },
  outdir,
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

// `specty ui` prefers `ui/` next to the bundle, so a copy left from packing would hide the
// monorepo's fresh build: only `--ui` puts one there.
await rm(join(outdir, "ui"), { recursive: true, force: true });
if (values.ui !== undefined) {
  const ui = resolve(values.ui);
  try {
    await access(join(ui, "index.html"));
  } catch {
    console.error(`build: ${ui} has no index.html; build the UI first.`);
    process.exit(1);
  }
  await cp(ui, join(outdir, "ui"), { recursive: true });
}
