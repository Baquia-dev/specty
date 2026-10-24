// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { cli, read, tempRepo, writeFiles } from "./support";

/** A manifest the detection reads: a test command, and lint and typecheck for the full one. */
const MANIFEST = JSON.stringify({
  name: "app",
  scripts: { test: "vitest run", lint: "biome check .", typecheck: "tsc" },
});

const NO_TESTS = "No se detectó un comando de tests";

/** A repository that started empty: `init` found nothing to verify with. */
async function started(): Promise<string> {
  const root = await tempRepo({ "README.md": "# App\n" });
  const first = await cli(root, ["init", "--language", "es", "--tools", "claude-code"]);
  expect(first.out).toContain(NO_TESTS);
  expect(parse(await read(root, ".specty/config.yaml")).verify).toEqual({ timeoutSec: 600 });
  return root;
}

describe("init on an existing configuration", () => {
  it("adds the verification the detection now finds, and keeps the rest (AC1)", async () => {
    const root = await started();
    const before = await read(root, ".specty/config.yaml");
    await writeFiles(root, { "package.json": MANIFEST });
    const planned = await cli(root, ["init", "--dry-run"]);
    expect(planned.out).toContain("cambiar .specty/config.yaml");
    const again = await cli(root, ["init"]);
    expect(again.out).toContain(
      ".specty/config.yaml: añadido verify.default (`npm test`) y verify.full (`npm run lint && npm run typecheck && npm test`); lo demás no se tocó.",
    );
    expect(again.out).not.toContain(NO_TESTS);
    const after = await read(root, ".specty/config.yaml");
    // Every line that was there stays, comments included; only the new keys are added.
    for (const line of before.split("\n")) expect(after).toContain(line);
    expect(parse(after).verify).toEqual({
      timeoutSec: 600,
      default: "npm test",
      full: "npm run lint && npm run typecheck && npm test",
    });
  });

  it("never changes a value that is there, and warns only without any test command (AC2, AC3)", async () => {
    const root = await started();
    const own = `${await read(root, ".specty/config.yaml")}`.replace(
      "verify:\n",
      'verify:\n  default: "make test"\n',
    );
    await writeFiles(root, { ".specty/config.yaml": own });
    const quiet = await cli(root, ["init"]);
    expect(quiet.out).toContain(".specty/config.yaml ya existía; no se tocó.");
    expect(quiet.out).not.toContain(NO_TESTS);
    await writeFiles(root, { "package.json": MANIFEST });
    const added = await cli(root, ["init"]);
    expect(added.out).toContain(".specty/config.yaml: añadido verify.full (");
    expect(parse(await read(root, ".specty/config.yaml")).verify.default).toBe("make test");
  });

  it("adds a verify block at the end when the file has none (AC1)", async () => {
    const root = await started();
    const own = '# Mi configuración\nversion: 1\nlanguage: es\ngoverned: ["src/**"]\n';
    await writeFiles(root, { ".specty/config.yaml": own, "package.json": MANIFEST });
    await cli(root, ["init"]);
    expect(await read(root, ".specty/config.yaml")).toBe(
      `${own}verify:\n  default: "npm test"\n  full: "npm run lint && npm run typecheck && npm test"\n`,
    );
  });
});
