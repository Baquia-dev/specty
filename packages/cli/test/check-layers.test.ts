// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const LAYERS = [
  "checks:",
  "  levels: { secrets: off }",
  "  layers:",
  '    domain: { paths: ["src/domain/**"], forbiddenPackages: ["@angular/*"] }',
  '    infrastructure: { paths: ["src/infrastructure/**"], may: [domain] }',
  "",
].join("\n");

const dependency = (module: string, resolved: string, types: readonly string[]) => ({
  module,
  resolved,
  dependencyTypes: types,
  coreModule: types.includes("core"),
  couldNotResolve: types.includes("unknown"),
});

/** What dependency-cruiser 18 reports for the files of these tests, as checked with 18.7.0. */
const CRUISE = {
  modules: [
    {
      source: "src/domain/user.ts",
      dependencies: [
        dependency("../infrastructure/db", "src/infrastructure/db.ts", ["local", "import"]),
        dependency("@angular/core", "node_modules/@angular/core/fesm2022/core.mjs", [
          "npm",
          "import",
        ]),
        dependency("../infrastructure/cache", "src/infrastructure/cache.ts", ["local", "import"]),
        dependency("./missing", "./missing", ["unknown"]),
        dependency("fs", "fs", ["core", "import"]),
      ],
    },
    {
      source: "src/infrastructure/db.ts",
      dependencies: [dependency("../domain/user", "src/domain/user.ts", ["local", "import"])],
    },
  ],
  summary: { violations: [], error: 0, warn: 0, info: 0 },
};

async function repo(config = LAYERS): Promise<string> {
  return tempRepo({
    "package.json": json({ name: "app", devDependencies: { typescript: "5.9.0" } }),
    "tsconfig.json": json({ compilerOptions: { strict: true } }),
    ".gitignore": "node_modules/\n",
    "src/domain/user.ts": 'import { db } from "../infrastructure/db";\n',
    "src/infrastructure/db.ts": 'import { User } from "../domain/user";\n',
    ".specty/config.yaml": `${CONFIG()}${config}`,
  });
}

/** A fake dependency-cruiser that logs its arguments and writes CRUISE, or fails. */
async function fakeCruiser(root: string, broken = false): Promise<string> {
  const log = join(await mkdtemp(join(tmpdir(), "specty-depcruise-")), "args.json");
  const bin = join(root, "node_modules/.bin/depcruise");
  await writeFiles(root, {
    "node_modules/.bin/depcruise": `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(args));
if (${broken}) {
  console.error("ERROR: Can't open 'tsconfig.json' for reading.");
  process.exit(1);
}
fs.writeFileSync(args[args.indexOf("--output-to") + 1], ${JSON.stringify(JSON.stringify(CRUISE))});
`,
  });
  await chmod(bin, 0o755);
  return log;
}

const CHANGED = [
  'import { db } from "../infrastructure/db";',
  'import { Injectable } from "@angular/core";',
  'import { cache } from "../infrastructure/cache";',
  'import { readFileSync } from "fs";',
  "",
].join("\n");

describe("the layers check of specty check", () => {
  it("fails on each import the change adds across the layers, with its line", async () => {
    const root = await repo();
    const log = await fakeCruiser(root);
    await writeFiles(root, { "src/domain/user.ts": CHANGED });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA layers",
        "  src/domain/user.ts:2 `domain` no puede importar el paquete `@angular/core`",
        "  src/domain/user.ts:3 `domain` no puede importar `infrastructure` (src/infrastructure/cache.ts)",
        "OK 8/9 · FALLA: layers",
      ].join("\n"),
    );
    expect(JSON.parse(await readFile(log, "utf8"))).toEqual([
      "--no-config",
      "--ts-pre-compilation-deps",
      "--ts-config",
      "tsconfig.json",
      "--do-not-follow",
      "node_modules",
      "--output-type",
      "json",
      "--output-to",
      expect.stringMatching(/deps\.json$/),
      "src/domain/user.ts",
    ]);
    const all = await cli(root, ["check", "--all"]);
    expect(all.out).toContain(
      "  src/domain/user.ts:1 `domain` no puede importar `infrastructure` (src/infrastructure/db.ts)",
    );
    expect(JSON.parse(await readFile(log, "utf8")).slice(-2)).toEqual([
      "src/domain",
      "src/infrastructure",
    ]);
  });

  it("does not run without dependency-cruiser or when it fails, and says why", async () => {
    const missing = await repo();
    await writeFiles(missing, { "src/domain/user.ts": CHANGED });
    const run = await cli(missing, ["check", "--verbose"]);
    expect(run.code).toBe(0);
    expect(run.out).toContain(
      "SIN EJECUTAR layers: dependency-cruiser no está instalado: añádelo como devDependency del proyecto para vigilar las capas",
    );
    const broken = await repo();
    await fakeCruiser(broken, true);
    await writeFiles(broken, { "src/domain/user.ts": CHANGED });
    expect((await cli(broken, ["check", "--verbose"])).out).toContain(
      "SIN EJECUTAR layers: dependency-cruiser: ERROR: Can't open 'tsconfig.json' for reading.",
    );
  });

  it("is absent without layers, and speaks English", async () => {
    const plain = await repo("checks:\n  levels: { secrets: off }\n");
    const ids = JSON.parse((await cli(plain, ["--json", "check"])).out).checks.map(
      (check: { id: string }) => check.id,
    );
    expect(ids).not.toContain("layers");
    const root = await repo();
    await fakeCruiser(root);
    await writeFiles(root, {
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${LAYERS}`,
      "src/domain/user.ts": CHANGED,
    });
    const run = await cli(root, ["check"]);
    expect(run.out).toContain(
      "  src/domain/user.ts:2 `domain` may not import the package `@angular/core`",
    );
    expect(run.out).toContain(
      "  src/domain/user.ts:3 `domain` may not import `infrastructure` (src/infrastructure/cache.ts)",
    );
  });
});
