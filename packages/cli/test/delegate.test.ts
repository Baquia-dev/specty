// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  AGENT,
  APP,
  CHANGE,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

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

/** The guard's answer to a Bash command of the agent: 0 lets it through, 2 blocks it. */
const bash = async (root: string, command: string) =>
  (
    await cli(root, ["guard", "--tool", "claude-code"], {
      stdin: JSON.stringify({ cwd: root, tool_name: "Bash", tool_input: { command } }),
    })
  ).code;

/** A change in review, its spec proposed by the agent. */
async function inReview(root: string): Promise<void> {
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
}

/** The same change, approved by its person and with a scope request pending. */
async function withRequest(root: string): Promise<void> {
  await inReview(root);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  await cli(root, ["scope", "add", "lib/other.ts", "--reason", "Ayudante"]);
}

describe("delegated mode", () => {
  it("lets the agent run the person's commands, and only those", async () => {
    const root = await delegated();
    await inReview(root);
    expect((await cli(root, ["next"])).out).toContain(
      "SIGUIENTE: modo delegado: aprueba tú la spec con `specty approve`",
    );
    const status = (await cli(root, ["status"], { terminal: person() })).out;
    expect(status).toContain("MODO DELEGADO");
    expect(status).toContain("`specty delegate off`");
    expect(await bash(root, "specty approve")).toBe(0);
    expect(await bash(root, "specty delegate off")).toBe(2);
  });

  it("decides scope requests and cancels without a TTY", async () => {
    const root = await delegated();
    await withRequest(root);
    const rejected = await cli(root, ["reject", "--scope", "S1", "--reason", "Usa src/app.ts"]);
    expect(rejected.code).toBe(0);
    expect(rejected.out).toContain("S1 rechazada.");
    expect(rejected.out).toContain("SIGUIENTE: sigue con `specty next`.");
    expect(await read(root, `.specty/changes/${CHANGE}/audit.jsonl`)).toContain(
      '"reason":"Usa src/app.ts"',
    );
    const cancelled = await cli(root, ["cancel", "--reason", "Ya no hace falta"]);
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain("Cambio cancelado y archivado");
  });

  it("changes nothing for a person who did not delegate, or took it back", async () => {
    for (const root of [await tempRepo(APP), await delegated()]) {
      await cli(root, ["delegate", "off"], { terminal: person() });
      await withRequest(root);
      expect((await cli(root, ["reject", "--scope", "S1"])).code).toBe(2);
      expect((await cli(root, ["cancel", "--reason", "x"])).code).toBe(2);
      expect(await bash(root, "specty approve")).toBe(2);
      expect((await cli(root, ["status"], { terminal: person() })).out).not.toContain(
        "MODO DELEGADO",
      );
    }
  });
});
