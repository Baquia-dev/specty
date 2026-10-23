// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  AGENT,
  APP,
  ARCHIVE,
  CHANGE,
  CONFIG,
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

interface AuditLine {
  readonly actor: string;
  readonly event: string;
  readonly data: Record<string, unknown>;
}

/** The audit lines of `event`, from the change's folder or the archive. */
async function audited(root: string, event: string, dir = `.specty/changes/${CHANGE}`) {
  const lines = (await read(root, `${dir}/audit.jsonl`)).trim().split("\n");
  return lines.map((line): AuditLine => JSON.parse(line)).filter((line) => line.event === event);
}

describe("delegated decisions on record", () => {
  it("approve for the person, with their name and the delegated channel", async () => {
    const root = await delegated();
    await inReview(root);
    const approved = await cli(root, ["approve"]);
    expect(approved.code).toBe(0);
    expect(approved.out).toContain("Revisión 1 aprobada (commit");
    expect(approved.out).toContain("SIGUIENTE: sigue con `specty next`.");
    const state = JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));
    expect(state.approved).toMatchObject({ by: "Ana", channel: "delegated" });
    expect(state.items.A1.decision).toBe("confirmed");
    expect(await audited(root, "spec.approved")).toMatchObject([
      { actor: "agent", data: { channel: "delegated", delegated: true } },
    ]);

    await cli(root, ["next"]);
    await cli(root, ["scope", "add", "lib/other.ts", "--reason", "Ayudante"]);
    expect((await cli(root, ["approve", "--scope", "S1"])).code).toBe(0);
    expect(await audited(root, "scope.decided")).toMatchObject([
      { actor: "agent", data: { id: "S1", decision: "approved", delegated: true } },
    ]);

    expect((await cli(root, ["cancel", "--reason", "Prueba"])).code).toBe(0);
    expect(await audited(root, "change.cancelled", `${ARCHIVE}/${CHANGE}`)).toMatchObject([
      { actor: "agent", data: { reason: "Prueba", delegated: true } },
    ]);
  });

  it("leave the person's own decisions as theirs while the mode is on", async () => {
    const root = await delegated();
    await inReview(root);
    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
    const state = JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));
    expect(state.approved).toMatchObject({ by: "Ana", channel: "tty" });
    const [line] = await audited(root, "spec.approved");
    expect(line?.actor).toBe("human");
    expect(line?.data.delegated).toBeUndefined();
  });
});

describe("delegated acceptance", () => {
  it("runs the full verification and accepts only when it passes", async () => {
    const root = await tempRepo({
      ...APP,
      ".specty/config.yaml": `${CONFIG()}  full: "test -f verificado"\n`,
    });
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    await inReview(root);
    await cli(root, ["approve"]);
    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "1\n" });
    await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    await writeFiles(root, { "src/app.ts": "2\n" });
    await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
    expect((await cli(root, ["next"])).out).toContain(
      "SIGUIENTE: modo delegado: acepta tú el resultado con `specty accept`",
    );

    const failed = await cli(root, ["accept"]);
    expect(failed.code).toBe(2);
    expect(failed.out).toContain("La verificación completa (`test -f verificado`) falló");
    expect(failed.out).toContain('`specty adjust "<qué falla>"`');
    expect(failed.err).toContain("Verificación fallida");
    expect(JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`)).phase).toBe(
      "acceptance",
    );

    await writeFiles(root, { verificado: "" });
    const accepted = await cli(root, ["accept"]);
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain("Resultado aceptado");
    expect(await audited(root, "change.accepted")).toMatchObject([
      { actor: "agent", data: { delegated: true } },
    ]);
  });
});
