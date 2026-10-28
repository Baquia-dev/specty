// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, git, tempRepo, writeFiles } from "./support";

/** A source with `count` lines of code. */
const source = (count: number): string =>
  `${Array.from({ length: count }, (_, index) => `export const v${index} = ${index};`).join("\n")}\n`;

/** `levels` are lines under `checks.levels`; `secrets` stays off, whatever the machine has. */
async function repo(levels = ""): Promise<string> {
  return tempRepo({
    "src/app.ts": source(10),
    ".specty/config.yaml": `${CONFIG()}checks:\n  levels:\n    secrets: off\n${levels}`,
  });
}

describe("specty check", () => {
  it("looks at what changed by default, leaves dependencies out and fails on errors", async () => {
    const root = await repo();
    await writeFiles(root, {
      "src/big.ts": source(520),
      "src/long.ts": source(320),
      "node_modules/lib/index.js": source(900),
      "docs/guide.md": source(900),
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA max-lines",
        "  src/big.ts 520 líneas de código (máximo 500)",
        "  src/long.ts 320 líneas de código (aviso a partir de 300)",
        "OK 3/4 · FALLA: max-lines",
      ].join("\n"),
    );
  });

  it("follows task done's rule: fails only on files the change takes past the maximum", async () => {
    const root = await tempRepo({
      "src/legacy.ts": source(520),
      "src/near.ts": source(480),
      "src/long.ts": source(320),
      ".specty/config.yaml": `${CONFIG()}checks:\n  levels:\n    secrets: off\n`,
    });
    // Already past the maximum, it grows; near it, it crosses; past the warning, it stays.
    await writeFiles(root, {
      "src/legacy.ts": source(525),
      "src/near.ts": source(510),
      "src/long.ts": source(320).replace("v0 = 0", "v0 = 1"),
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA max-lines",
        "  src/legacy.ts 525 líneas de código (aviso a partir de 300)",
        "  src/near.ts 510 líneas de código (máximo 500)",
        "OK 3/4 · FALLA: max-lines",
      ].join("\n"),
    );
    // Without a starting point, every file counts.
    expect((await cli(root, ["check", "--all"])).out).toContain(
      "  src/legacy.ts 525 líneas de código (máximo 500)",
    );
  });

  it("looks at what is staged with --staged, and at everything with --all", async () => {
    const root = await repo();
    await writeFiles(root, { "src/big.ts": source(520), "src/long.ts": source(320) });
    git(root, "add", "src/long.ts");
    const staged = await cli(root, ["check", "--staged"]);
    expect(staged.code).toBe(0);
    expect(staged.out).toBe(
      "AVISO max-lines\n  src/long.ts 320 líneas de código (aviso a partir de 300)\nOK 3/4 · AVISO: max-lines",
    );
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "x", "--no-verify");
    expect((await cli(root, ["check"])).out).toBe("OK 4/4");
    const all = await cli(root, ["check", "--all"]);
    expect(all.code).toBe(1);
    expect(all.out).toContain("  src/big.ts 520 líneas de código (máximo 500)");
  });

  it("judges what is staged with --staged, not what is on disk", async () => {
    const root = await repo();
    await writeFiles(root, { "src/big.ts": source(520) });
    git(root, "add", "src/big.ts");
    await writeFiles(root, { "src/big.ts": source(5) });
    const staged = await cli(root, ["check", "--staged"]);
    expect(staged.code).toBe(1);
    expect(staged.out).toContain("  src/big.ts 520 líneas de código (máximo 500)");
    expect((await cli(root, ["check"])).code).toBe(0);
  });

  it("gives JSON for CI and the detail with --verbose", async () => {
    const root = await repo();
    await writeFiles(root, { "src/big.ts": source(520) });
    // As CI runs it: the global --json after the command.
    expect(JSON.parse((await cli(root, ["check", "--all", "--json"])).out).mode).toBe("all");
    const json = JSON.parse((await cli(root, ["--json", "check"])).out);
    expect(json).toMatchObject({
      mode: "changed",
      checks: [
        { id: "max-lines", level: "error", status: "failed" },
        { id: "focused-tests", status: "passed" },
        { id: "skipped-tests", status: "passed" },
        { id: "todo", status: "passed" },
      ],
      summary: { passed: 3, total: 4, failed: ["max-lines"] },
      exitCode: 1,
    });
    await writeFiles(root, { "src/big.ts": source(5) });
    expect((await cli(root, ["check", "--verbose"])).out).toBe(
      "OK max-lines\nOK focused-tests\nOK skipped-tests\nOK todo\nOK 4/4",
    );
  });

  it("follows the level of each check", async () => {
    const off = await repo("    max-lines: off\n");
    await writeFiles(off, { "src/big.ts": source(520) });
    expect(await cli(off, ["check"])).toMatchObject({ code: 0, out: "OK 3/3" });
    const warn = await repo("    max-lines: warn\n");
    await writeFiles(warn, { "src/big.ts": source(520) });
    const run = await cli(warn, ["check"]);
    expect(run.code).toBe(0);
    expect(run.out).toContain("AVISO max-lines");
  });
});
