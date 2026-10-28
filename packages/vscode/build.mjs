// SPDX-License-Identifier: Apache-2.0
// Bundles the extension into `dist/extension.cjs`, the `main` VS Code loads. With `--vsix`, it
// also puts in `dist/vsix` only what ships (the bundle, the manifest and its texts, the README,
// LICENSE and NOTICE) and packs it into `dist/specty.vsix`, without publishing it.
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const { values } = parseArgs({ options: { vsix: { type: "boolean", default: false } } });

await build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.cjs",
  bundle: true,
  platform: "node",
  // VS Code 1.90 runs its extensions on Node 20.
  target: "node20",
  format: "cjs",
  // VS Code gives the extension its API when it loads it.
  external: ["vscode"],
  legalComments: "eof",
  logLevel: "warning",
});

if (values.vsix) {
  const stage = "dist/vsix";
  const shipped = [
    ["dist/extension.cjs"],
    ["package.json"],
    ["package.nls.json"],
    ["package.nls.es.json"],
    ["README.md"],
    ["../../LICENSE", "LICENSE"],
    ["../../NOTICE", "NOTICE"],
  ];
  await rm(stage, { recursive: true, force: true });
  for (const [from, to = from] of shipped) {
    await mkdir(join(stage, dirname(to)), { recursive: true });
    await cp(from, join(stage, to));
  }
  // vsce only when packing: it takes a while to load.
  const { createVSIX } = await import("@vscode/vsce");
  // The bundle carries its dependencies: vsce must not look for them.
  await createVSIX({ cwd: stage, packagePath: resolve("dist/specty.vsix"), dependencies: false });
}
