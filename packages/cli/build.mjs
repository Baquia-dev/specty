// SPDX-License-Identifier: Apache-2.0
// Bundles the CLI and its dependencies into `specty.mjs` and its chunks: users install nothing
// else, and the hooks load only their own entry. `--ui <folder>` copies a build of the UI next to
// it, for the npm package; `--outdir <folder>` writes somewhere else than `dist`; `--metafile
// <file>` keeps esbuild's metafile, for the tests.
import { access, cp, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const { values } = parseArgs({
  options: {
    ui: { type: "string" },
    outdir: { type: "string", default: "dist" },
    metafile: { type: "string" },
  },
});
const outdir = values.outdir;

const result = await build({
  entryPoints: { specty: "src/main.ts" },
  outdir,
  outExtension: { ".js": ".mjs" },
  // The chunks stay next to the entry: `import.meta.url` must point to this folder (`ui/`).
  splitting: true,
  chunkNames: "[name]-[hash]",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Prefer ESM entries: jsonc-parser's UMD build uses dynamic requires that cannot be bundled.
  mainFields: ["module", "main"],
  legalComments: "eof",
  metafile: true,
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __specty_createRequire } from 'node:module';",
      "const require = __specty_createRequire(import.meta.url);",
    ].join("\n"),
  },
});
if (values.metafile !== undefined) {
  await writeFile(values.metafile, JSON.stringify(result.metafile));
}

// Chunks of earlier builds, which nothing imports any more.
const built = new Set(Object.keys(result.metafile.outputs).map((path) => basename(path)));
for (const file of await readdir(outdir)) {
  if (file.endsWith(".mjs") && !built.has(file)) await rm(join(outdir, file));
}

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
