// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { cli, read, tempRepo } from "./support";

const TITLE = "UNIDADES DE VERIFICACIÓN PROPUESTAS";

/** A package's `package.json`, with a test script unless `tests` is false. */
const manifest = (name: string, uses: readonly string[] = [], tests = true) =>
  JSON.stringify({
    name,
    ...(tests ? { scripts: { test: "vitest run" } } : {}),
    dependencies: Object.fromEntries(uses.map((dep) => [dep, "workspace:*"])),
  });

/** A workspace: core, cli on core, and docs without tests; `root` is the rest of the root files. */
function workspace(root: Readonly<Record<string, string>>, workspaces?: readonly string[]) {
  return tempRepo({
    "package.json": JSON.stringify({
      name: "demo",
      private: true,
      ...(workspaces === undefined ? {} : { workspaces }),
      scripts: {
        test: "vitest",
        lint: "biome check",
        typecheck: "tsc",
        check: "pnpm lint && pnpm test",
      },
      devDependencies: { typescript: "7" },
    }),
    "packages/core/package.json": manifest("@demo/core"),
    "packages/cli/package.json": manifest("@demo/cli", ["@demo/core"]),
    "packages/docs/package.json": manifest("@demo/docs", [], false),
    ...root,
  });
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** The units of the block in `out`: its lines, without the block's indent, read under `verify:`. */
function proposed(out: string): unknown {
  const after = (out.split(`${TITLE}:\n`)[1] ?? "").split("\n");
  const end = after.findIndex((line) => !line.startsWith("  "));
  const lines = (end < 0 ? after : after.slice(0, end)).map((line) => line.slice(2));
  const yaml = lines.filter((line) => line === "  units:" || line.startsWith("    "));
  const doc: unknown = parse(`verify:\n${yaml.join("\n")}\n`);
  return isRecord(doc) && isRecord(doc.verify) ? doc.verify.units : undefined;
}

describe("specty init in a workspace", () => {
  it("AC1: in pnpm, proposes the static checks and one unit per package with tests, with the folders it uses", async () => {
    const root = await workspace({
      "pnpm-lock.yaml": "lockfileVersion: 9\n",
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    });
    const result = await cli(root, ["init", "--language", "es"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(`${TITLE}:`);
    const shared = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"];
    expect(proposed(result.out)).toEqual([
      { name: "estático", command: "pnpm lint && pnpm typecheck", paths: ["**"] },
      {
        name: "core",
        command: "pnpm --filter @demo/core test",
        paths: ["packages/core/**", ...shared],
      },
      {
        name: "cli",
        command: "pnpm --filter @demo/cli test",
        paths: ["packages/cli/**", "packages/core/**", ...shared],
      },
    ]);
  });

  it("AC1: in npm and in yarn, runs each package's tests as they do", async () => {
    const npm = await workspace({ "package-lock.json": "{}\n" }, ["packages/*"]);
    const npmOut = (await cli(npm, ["init", "--language", "es"])).out;
    expect(npmOut).toContain('command: "npm test --workspace=@demo/core"');
    const yarn = await workspace({ "yarn.lock": "# yarn\n" }, ["packages/*"]);
    const yarnOut = (await cli(yarn, ["init", "--language", "es"])).out;
    expect(yarnOut).toContain('command: "yarn workspace @demo/cli test"');
  });

  it("AC2: proposes nothing when the configuration already has units, or with one package with tests", async () => {
    const units = await workspace({
      "pnpm-lock.yaml": "lockfileVersion: 9\n",
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
      ".specty/config.yaml":
        'version: 1\nlanguage: es\nverify:\n  units:\n    - name: todo\n      command: "pnpm test"\n      paths: ["**"]\n',
    });
    expect((await cli(units, ["init", "--language", "es"])).out).not.toContain(TITLE);
    const single = await tempRepo({
      "package.json": JSON.stringify({ name: "demo", scripts: { test: "vitest" } }),
      "pnpm-lock.yaml": "lockfileVersion: 9\n",
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
      "packages/core/package.json": manifest("@demo/core"),
    });
    expect((await cli(single, ["init", "--language", "es"])).out).not.toContain(TITLE);
  });

  it("AC3: does not write them, and says who adds them", async () => {
    const root = await workspace({
      "pnpm-lock.yaml": "lockfileVersion: 9\n",
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    });
    const result = await cli(root, ["init", "--language", "es"]);
    expect(result.out).toContain("Añádelas tú a `verify:` en .specty/config.yaml");
    const config = parse(await read(root, ".specty/config.yaml"));
    expect(config.verify.units).toBeUndefined();
  });
});
