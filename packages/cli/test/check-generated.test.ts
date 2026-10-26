// SPDX-License-Identifier: Apache-2.0
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CONFIG, cli, read, tempRepo, writeFiles } from "./support";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** A generator that writes `a.ts`, adds `new.ts` and drops `old.ts` in `src/gen`. */
const GENERATOR = `const fs = require("node:fs");
fs.mkdirSync("src/gen", { recursive: true });
fs.writeFileSync("src/gen/a.ts", "export const a = 2;\\n");
fs.writeFileSync("src/gen/new.ts", "export const n = 1;\\n");
fs.rmSync("src/gen/old.ts", { force: true });
`;

const CONFIGURED = [
  "checks:",
  "  levels: { secrets: off }",
  "  generators:",
  '    - { command: "node tools/gen.js", outputs: ["src/gen/**"], inputs: ["schema/**"] }',
  "",
].join("\n");

async function repo(files: Readonly<Record<string, string>>, config: string): Promise<string> {
  return tempRepo({
    ".specty/config.yaml": `${CONFIG()}${config}`,
    "src/app.ts": "export const app = 1;\n",
    ...files,
  });
}

describe("the generated code check of specty check", () => {
  it("fails when the generator does not produce what is there, and leaves it as it was", async () => {
    const root = await repo(
      {
        "tools/gen.js": GENERATOR,
        "schema/model.txt": "a: 1\n",
        "src/gen/a.ts": "export const a = 1;\n",
        "src/gen/old.ts": "export const o = 1;\n",
      },
      CONFIGURED,
    );
    await writeFiles(root, { "schema/model.txt": "a: 2\n" });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA generated",
        "  src/gen/a.ts no coincide con lo que genera `node tools/gen.js`: regenéralo",
        "  src/gen/new.ts lo genera `node tools/gen.js` y no está en el repositorio",
        "  src/gen/old.ts ya no lo genera `node tools/gen.js`",
        "OK 4/5 · FALLA: generated",
      ].join("\n"),
    );
    expect(await read(root, "src/gen/a.ts")).toBe("export const a = 1;\n");
    expect(await read(root, "src/gen/old.ts")).toBe("export const o = 1;\n");
    expect(await exists(join(root, "src/gen/new.ts"))).toBe(false);
  });

  it("runs only when the change touches a source or an output, and always with --all", async () => {
    const root = await repo(
      {
        "tools/gen.js": GENERATOR,
        "schema/model.txt": "a: 1\n",
        "src/gen/a.ts": "export const a = 1;\n",
        "src/gen/old.ts": "export const o = 1;\n",
      },
      CONFIGURED,
    );
    await writeFiles(root, { "src/app.ts": "export const app = 2;\n" });
    expect((await cli(root, ["check"])).code).toBe(0);
    expect((await cli(root, ["check", "--all"])).out).toContain("FALLA generated");
    const fresh = await repo(
      {
        "tools/gen.js": GENERATOR,
        "schema/model.txt": "a: 1\n",
        "src/gen/a.ts": "export const a = 2;\n",
        "src/gen/new.ts": "export const n = 1;\n",
      },
      CONFIGURED,
    );
    await writeFiles(fresh, { "schema/model.txt": "a: 2\n" });
    expect(await cli(fresh, ["check"])).toMatchObject({ code: 0, out: "OK 5/5" });
  });

  it("finds Prisma's client by the output of its schema, and runs it with the package manager", async () => {
    const root = await repo(
      {
        "package.json": json({
          name: "app",
          dependencies: { "@prisma/client": "6.19.0" },
          devDependencies: { prisma: "6.19.0" },
        }),
        ".gitignore": "node_modules/\n",
        "prisma/schema.prisma": [
          "generator client {",
          '  provider = "prisma-client"',
          '  output   = "../src/generated/prisma"',
          "}",
          "",
        ].join("\n"),
        "src/generated/prisma/client.ts": "export const version = 1;\n",
      },
      "checks:\n  levels: { secrets: off }\n",
    );
    await writeFiles(root, {
      "node_modules/.bin/prisma": `#!/usr/bin/env node
require("node:fs").writeFileSync("src/generated/prisma/client.ts", "export const version = 2;\\n");
`,
      "prisma/schema.prisma": `${await read(root, "prisma/schema.prisma")}model User {\n  id Int @id\n}\n`,
    });
    await chmod(join(root, "node_modules/.bin/prisma"), 0o755);
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(
      "  src/generated/prisma/client.ts no coincide con lo que genera `npx prisma generate`: regenéralo",
    );
    expect(await read(root, "src/generated/prisma/client.ts")).toBe("export const version = 1;\n");
  });

  it("finds build_runner, says when its command fails, and is absent with no generator", async () => {
    const root = await repo(
      {
        "pubspec.yaml": "name: app\ndev_dependencies:\n  build_runner: ^2.4.0\n",
        "lib/user.dart": "part 'user.g.dart';\n\nclass User {}\n",
      },
      "checks:\n  levels: { secrets: off, tests: off, lint: off, format: off }\n",
    );
    await writeFiles(root, {
      "lib/user.dart": "part 'user.g.dart';\n\nclass User {\n  final String name = '';\n}\n",
    });
    expect((await cli(root, ["check", "--verbose"])).out).toContain(
      "SIN EJECUTAR generated: dart run build_runner build --delete-conflicting-outputs:",
    );
    const plain = await repo({}, "checks:\n  levels: { secrets: off }\n");
    const ids = JSON.parse((await cli(plain, ["--json", "check"])).out).checks.map(
      (check: { id: string }) => check.id,
    );
    expect(ids).not.toContain("generated");
  });

  it("says it in English", async () => {
    const root = await repo(
      {
        "tools/gen.js": GENERATOR,
        "schema/model.txt": "a: 1\n",
        "src/gen/a.ts": "export const a = 1;\n",
        "src/gen/old.ts": "export const o = 1;\n",
      },
      CONFIGURED,
    );
    await writeFiles(root, {
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${CONFIGURED}`,
      "schema/model.txt": "a: 2\n",
    });
    const run = await cli(root, ["check"]);
    expect(run.out).toContain(
      "  src/gen/a.ts does not match what `node tools/gen.js` generates: regenerate it",
    );
    expect(run.out).toContain(
      "  src/gen/new.ts `node tools/gen.js` generates it, and it is not in the repository",
    );
    expect(run.out).toContain("  src/gen/old.ts `node tools/gen.js` no longer generates it");
  });
});
