// SPDX-License-Identifier: Apache-2.0
// Bundles the CLI and its dependencies into `specty.mjs` and its chunks: users install nothing
// else, and the hooks load only their own entry. `--ui <folder>` copies a build of the UI next to
// it, for the npm package; `--outdir <folder>` writes somewhere else than `dist`; `--metafile
// <file>` keeps esbuild's metafile, for the tests. With a build of the UI, `--ui`'s or the
// monorepo's, it also writes the page of the MCP App, `mcp-app.html` (ADR 0015).
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { brotliCompress, constants } from "node:zlib";
import { build } from "esbuild";
import { mcpAppPage } from "./mcp-app.mjs";

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
  // web-tree-sitter's Emscripten code calls `eval`, which esbuild warns about; it works bundled.
  logOverride: { "direct-eval": "silent" },
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

// Apache-2.0 asks every distribution to carry the license and the notice, and the package
// publishes only this folder (`files: ["dist"]`).
for (const name of ["LICENSE", "NOTICE"]) await cp(join("..", "..", name), join(outdir, name));

// The tree-sitter runtime and the grammars that `src/check/syntax.ts` loads (ADR 0016), compressed
// with brotli at quality 9: 11 would save a tenth of the size and take eighty times as long.
const require = createRequire(import.meta.url);
const GRAMMARS = ["typescript", "tsx", "javascript"];
const runtime = require.resolve("web-tree-sitter/web-tree-sitter.wasm");
const compiled = join(dirname(require.resolve("@repomix/tree-sitter-wasms/package.json")), "out");
const grammars = join(outdir, "grammars");
await rm(grammars, { recursive: true, force: true });
await mkdir(grammars);
const compress = promisify(brotliCompress);
const packed = [
  ["web-tree-sitter", runtime],
  ...GRAMMARS.map((name) => [`tree-sitter-${name}`, join(compiled, `tree-sitter-${name}.wasm`)]),
];
await Promise.all(
  packed.map(async ([name, file]) => {
    const params = { [constants.BROTLI_PARAM_QUALITY]: 9 };
    await writeFile(
      join(grammars, `${name}.wasm.br`),
      await compress(await readFile(file), { params }),
    );
  }),
);
// Their licenses: the runtime's from its package; the grammars', which their package does not
// carry, from `grammar-licenses.txt`.
const licenses = [
  "== web-tree-sitter: web-tree-sitter.wasm.br ==\n",
  await readFile(join(dirname(runtime), "LICENSE"), "utf8"),
  await readFile("grammar-licenses.txt", "utf8"),
];
await writeFile(join(grammars, "LICENSES"), licenses.join("\n"));

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

// The page of the MCP App: from `--ui`, or from the monorepo's build of the UI if there is one.
await rm(join(outdir, "mcp-app.html"), { force: true });
const uiBuild = resolve(values.ui ?? join("..", "ui", "dist", "browser"));
const hasUi = await access(join(uiBuild, "index.html")).then(
  () => true,
  () => false,
);
// A build that loads no script has nothing to pack: no page, and the build goes on.
const page = hasUi ? await mcpAppPage(uiBuild) : undefined;
if (page !== undefined) await writeFile(join(outdir, "mcp-app.html"), page);
