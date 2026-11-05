// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  CHANGE,
  CONFIG,
  cli,
  git,
  inWorktree,
  person,
  read,
  stateIn,
  toAcceptance,
  toClosing,
  tryGit,
  writeFiles,
} from "./support";

const BRANCH = `specty/${CHANGE}`;
const NOTES = "docs/notas.md";

/** The change's folder is as it was: no merge under way, the same commit, `file` with `text`. */
async function untouched(folder: string, head: string, file: string, text: string, phase: string) {
  expect(tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status).not.toBe(0);
  expect(git(folder, "rev-parse", "HEAD")).toBe(head);
  expect(await read(folder, file)).toBe(text);
  const state = await stateIn(folder);
  expect(state).toHaveProperty("phase", phase);
  expect(state).not.toHaveProperty("integration");
}

describe("bringing main in over uncommitted files it also changed", () => {
  it("AC1: close names the uncommitted configuration, says only the person handles it, and closes once discarded", async () => {
    const { root, folder } = await inWorktree();
    await toClosing(folder);
    await writeFiles(root, { ".specty/config.yaml": `${CONFIG()}# main\n` });
    git(root, "commit", "-q", "-am", "main cambia la configuración");
    const fixed = `${CONFIG()}# corregida en la carpeta\n`;
    await writeFiles(folder, { ".specty/config.yaml": fixed });
    const head = git(folder, "rev-parse", "HEAD");

    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(2);
    expect(closed.out).toContain("No se cerró y nada cambió.");
    expect(closed.out).toContain(
      "main también cambió archivos que aquí tienen cambios sin commit: el merge los pisaría, así que no empezó.",
    );
    expect(closed.out).toContain("SIN COMMIT:\n  .specty/config.yaml");
    expect(closed.out).toContain(
      "Solo la persona puede hacer el commit de los cambios de .specty/config.yaml o descartarlos",
    );
    expect(closed.out).toContain(
      "SIGUIENTE: haz el commit de esos archivos o descarta sus cambios en esta carpeta y vuelve a ejecutar `specty close`.",
    );
    expect(closed.out).not.toContain("git merge main");
    expect(closed.out).not.toContain("Merge with strategy");
    await untouched(folder, head, ".specty/config.yaml", fixed, "closing");

    git(folder, "checkout", "--", ".specty/config.yaml");
    const again = await cli(folder, ["close"], { terminal: person() });
    expect(again.code).toBe(0);
    expect(again.out).toContain("Incorporado a main.");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", BRANCH));
    expect(await exists(folder)).toBe(false);
  });

  it("AC2: accept names an untracked file main added, without the person's line", async () => {
    const { root, folder } = await inWorktree();
    await toAcceptance(folder);
    await writeFiles(root, { [NOTES]: "de main\n" });
    git(root, "add", NOTES);
    git(root, "commit", "-q", "-m", "main añade las notas");
    await writeFiles(folder, { [NOTES]: "de la carpeta\n" });
    const head = git(folder, "rev-parse", "HEAD");

    const accepted = await cli(folder, ["accept"], { terminal: person() });
    expect(accepted.code).toBe(2);
    expect(accepted.out).toContain("No se aceptó y nada cambió.");
    expect(accepted.out).toContain(`SIN COMMIT:\n  ${NOTES}`);
    expect(accepted.out).not.toContain("Solo la persona");
    expect(accepted.out).toContain(
      "SIGUIENTE: haz el commit de esos archivos o descarta sus cambios en esta carpeta y vuelve a ejecutar `specty accept`.",
    );
    await untouched(folder, head, NOTES, "de la carpeta\n", "acceptance");
  });
});
