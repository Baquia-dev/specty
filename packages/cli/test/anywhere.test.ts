// SPDX-License-Identifier: Apache-2.0
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import type { Terminal } from "../src/session";
import {
  APP,
  CHANGE,
  cli,
  folderOf,
  git,
  inWorktree,
  person,
  read,
  SPEC,
  SPEC_PATH,
  stateIn,
  tempRepo,
  writeFiles,
} from "./support";

const BRANCH = `specty/${CHANGE}`;
const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");

/** A change of `root`, in its own worktree, with SPEC (titled `title`) proposed: in review. */
async function inReview(root: string, title: string, id: string): Promise<string> {
  expect((await cli(root, ["new", "--worktree", title])).code).toBe(0);
  const folder = folderOf(root, id);
  const spec = SPEC.replace("# Saludo personalizado", `# ${title}`);
  await writeFiles(folder, { [`.specty/changes/${id}/spec.md`]: spec });
  expect((await cli(folder, ["propose"])).code).toBe(0);
  return folder;
}

/** Takes SPEC's change in `folder` from its approval to acceptance. */
async function implement(folder: string): Promise<void> {
  await cli(folder, ["next"]);
  await writeFiles(folder, { "src/app.ts": "1\n" });
  await cli(folder, ["task", "done", "T1", "--summary", "Uno"]);
  await writeFiles(folder, { "src/app.ts": "2\n" });
  await cli(folder, ["task", "done", "T2", "--summary", "Dos"]);
}

describe("status from any folder", () => {
  it("lists every worktree's change with its folder, not the copies a branch inherited (AC5)", async () => {
    const { root, folder } = await inWorktree();
    await writeFiles(folder, { [SPEC_PATH]: SPEC });
    await cli(folder, ["propose"]);
    await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    // The other change starts from this one's branch, so it carries a copy of it as it was then.
    expect((await cli(root, ["new", "--worktree", "--from", BRANCH, "Otro cambio"])).code).toBe(0);
    const other = folderOf(root, OTHER);
    await implement(folder);

    const fromOther = (await cli(other, ["status"])).out;
    expect(fromOther).toContain(`▸ ${OTHER} · standard · draft · espera al agente — Otro cambio\n`);
    expect(fromOther).toContain(
      `  ${CHANGE} · standard · acceptance · espera a ti — Saludo personalizado · en ../${CHANGE}`,
    );
    expect(fromOther).not.toContain(`${CHANGE} · standard · implementing`);
    expect(fromOther).toContain(`SIGUIENTE: te toca decidir en ${CHANGE}: \`specty accept\`.`);

    const fromRoot = (await cli(root, ["status"])).out;
    const home = `../${basename(root)}.worktrees`;
    expect(fromRoot).toContain(
      `  ${CHANGE} · standard · acceptance · espera a ti — Saludo personalizado · en ${home}/${CHANGE}`,
    );
    expect(fromRoot).toContain(
      `  ${OTHER} · standard · draft · espera al agente — Otro cambio · en ${home}/${OTHER}`,
    );
    expect(fromRoot).not.toContain("▸");
  });
});

describe("a person's decisions from any folder", () => {
  it("approves the only change in review, in its worktree, and says which (AC1)", async () => {
    const root = await tempRepo(APP);
    const folder = await inReview(root, "Saludo personalizado", CHANGE);
    // A change that waits for nothing of the person's is no candidate.
    expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
    const terminal = person({ choose: ["confirm"] });
    const approved = await cli(root, ["approve"], { terminal });
    expect(approved.code).toBe(0);
    expect(approved.out).toContain(`SPECTY · ${CHANGE} · implementing`);
    expect(terminal.notes).toContain(
      `Cambio\n${CHANGE} — Saludo personalizado, en ../${basename(root)}.worktrees/${CHANGE}`,
    );
    expect(await stateIn(folder)).toMatchObject({ phase: "implementing" });
  });

  it("asks which change when several wait, and acts on the one named (AC2)", async () => {
    const root = await tempRepo(APP);
    const first = await inReview(root, "Saludo personalizado", CHANGE);
    const second = await inReview(root, "Otro cambio", OTHER);
    const asked: string[] = [];
    const base = person({ choose: [OTHER, "confirm"] });
    const terminal: Terminal = {
      ...base,
      choose: (message, options) => {
        asked.push(message, ...options.map((option) => option.label));
        return base.choose(message, options);
      },
    };
    await cli(root, ["approve"], { terminal });
    expect(asked[0]).toBe("¿En qué cambio?");
    expect(asked).toContain(`${CHANGE} · review — Saludo personalizado`);
    expect(asked).toContain(`${OTHER} · review — Otro cambio`);
    expect(await stateIn(second, OTHER)).toMatchObject({ phase: "implementing" });
    expect(await stateIn(first)).toMatchObject({ phase: "review" });
    const named = await cli(root, ["approve", CHANGE], {
      terminal: person({ choose: ["confirm"] }),
    });
    expect(named.out).toContain(`SPECTY · ${CHANGE} · implementing`);
  });

  it("accepts and closes from the main folder, as from the change's worktree (AC3)", async () => {
    const root = await tempRepo(APP);
    const folder = await inReview(root, "Saludo personalizado", CHANGE);
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await implement(folder);
    expect((await cli(root, ["accept"], { terminal: person() })).out).toContain(
      "el agente redactará el cierre",
    );
    const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
    await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${closing}` });
    expect((await cli(folder, ["propose"])).out).toContain("Cierre válido.");
    const closed = await cli(root, ["close"], { terminal: person() });
    expect(closed.out).toContain("Incorporado a main.");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", BRANCH));
    expect(await read(root, "src/app.ts")).toBe("2\n");
    expect(await exists(folder)).toBe(false);
  });

  it("says when no change waits, names a missing one, and leaves agents to their folder (AC4, AC6)", async () => {
    const root = await tempRepo(APP);
    const none = await cli(root, ["accept"], { terminal: person() });
    expect(none.code).toBe(2);
    expect(none.out).toContain(
      "Ningún cambio espera `accept`.\nSIGUIENTE: revisa `specty status`.",
    );
    const missing = await cli(root, ["close", "nada"], { terminal: person() });
    expect(missing.out).toContain("No hay ningún cambio nada.");
    const folder = await inReview(root, "Saludo personalizado", CHANGE);
    const agent = await cli(root, ["approve"]);
    expect(agent.code).toBe(2);
    expect(agent.out).toContain("lo ejecuta una persona en su terminal");
    // Delegated mode lets the agent decide, but only on its own folder's change.
    const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    expect(on.code).toBe(0);
    expect((await cli(root, ["approve"])).out).toContain("No hay un cambio activo.");
    expect(await stateIn(folder)).toMatchObject({ phase: "review" });
  });
});
