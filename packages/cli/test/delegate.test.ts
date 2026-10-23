// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { AGENT, APP, cli, git, person, tempRepo } from "./support";

/** Where the switch lives, as git resolves it from `cwd`. */
function switchOf(cwd: string): string {
  const path = git(cwd, "rev-parse", "--git-path", "common/specty/delegated.json").trim();
  return isAbsolute(path) ? path : join(cwd, path);
}

/** A repository with delegated mode turned on by its person. */
async function delegated(): Promise<string> {
  const root = await tempRepo(APP);
  expect(
    (await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) })).code,
  ).toBe(0);
  return root;
}

describe("specty delegate", () => {
  it("turns delegated mode on only after the warning and an explicit yes", async () => {
    const root = await tempRepo(APP);
    const declined = await cli(root, ["delegate", "on"], { terminal: person() });
    expect(declined.out).toContain("Modo delegado desactivado");
    expect(await exists(switchOf(root))).toBe(false);

    const terminal = person({ choose: ["yes"] });
    const on = await cli(root, ["delegate", "on"], { terminal });
    expect(on.code).toBe(0);
    expect(on.out).toContain("Modo delegado activado");
    expect(terminal.notes.join("\n")).toContain(
      "aprueba specs y confirma sus supuestos de impacto alto",
    );
    expect(terminal.notes.join("\n")).toContain("`specty delegate off`");
    expect(JSON.parse(await readFile(switchOf(root), "utf8"))).toMatchObject({ by: "Ana" });

    const again = person();
    expect((await cli(root, ["delegate", "on"], { terminal: again })).out).toContain(
      "Modo delegado activado",
    );
    expect(again.notes).toEqual([]);
  });

  it("applies to every worktree of the clone", async () => {
    const root = await delegated();
    const other = join(dirname(root), `${basename(root)}-otra`);
    git(root, "worktree", "add", "-q", "-b", "otra", other);
    expect(switchOf(other)).toBe(switchOf(root));
    expect(await exists(switchOf(other))).toBe(true);
  });

  it("refuses the switch to an agent, both ways", async () => {
    const root = await tempRepo(APP);
    const on = await cli(root, ["delegate", "on"], { terminal: AGENT });
    expect(on.code).toBe(2);
    expect(on.out).toContain("`specty delegate on` lo ejecuta una persona en su terminal");
    expect(await exists(switchOf(root))).toBe(false);

    const active = await delegated();
    const off = await cli(active, ["delegate", "off"], { terminal: AGENT });
    expect(off.code).toBe(2);
    expect(await exists(switchOf(active))).toBe(true);
  });

  it("turns it off from the person's terminal", async () => {
    const root = await delegated();
    const off = await cli(root, ["delegate", "off"], { terminal: person() });
    expect(off.code).toBe(0);
    expect(off.out).toContain("Modo delegado desactivado");
    expect(await exists(switchOf(root))).toBe(false);
    expect((await cli(root, ["delegate", "maybe"], { terminal: person() })).code).toBe(1);
  });
});
