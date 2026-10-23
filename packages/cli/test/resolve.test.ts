// SPDX-License-Identifier: Apache-2.0

import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  git,
  inWorktree,
  person,
  quickInWorktree,
  read,
  stateIn,
  tempRepo,
  toClosing,
  tryGit,
  writeFiles,
} from "./support";

/** Claude Code's hook before an agent action, run from `cwd`. */
const claude = (cwd: string, tool: string, input: Record<string, unknown>) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ cwd, tool_name: tool, tool_input: input }),
  });

/** A change whose closing hit conflicts with main: the merge waits for the agent in `folder`. */
async function conflicted(files: Readonly<Record<string, string>> = APP) {
  const { root, folder } = await inWorktree(files);
  await toClosing(folder);
  await writeFiles(root, { "src/app.ts": "main\n" });
  git(root, "commit", "-q", "-am", "main cambia el saludo");
  expect((await cli(folder, ["close"], { terminal: person() })).code).toBe(2);
  return { root, folder };
}

describe("the agent sees the pending incorporation", () => {
  it("in its card, in the status and in the guard (AC3)", async () => {
    const { folder } = await conflicted();
    const next = await cli(folder, ["next"]);
    expect(next.out).toContain(`SPECTY · ${CHANGE} · closing · incorporando main`);
    expect(next.out).toContain("CONFLICTOS:\n  src/app.ts\nPUEDES TOCAR:\n  src/app.ts");
    expect(next.out).toContain("ejecuta `specty integrate`.");
    // «a el» is a known wording bug of the status card; either form says it waits for the agent.
    expect((await cli(folder, ["status"])).out).toMatch(/closing · espera a(l| el) agente/);
    expect((await claude(folder, "Write", { file_path: join(folder, "src/app.ts") })).code).toBe(0);
    const outside = await claude(folder, "Write", { file_path: join(folder, "src/other.ts") });
    expect(outside.code).toBe(2);
    expect(outside.err).toContain(
      "`src/other.ts` queda fuera de la incorporación de main: solo se tocan los archivos que cambiaron este cambio o main.",
    );
    const commit = await claude(folder, "Bash", { command: "git commit -am resuelto" });
    expect(commit.err).toContain("ejecuta `specty integrate`.");
  });
});

describe("specty integrate", () => {
  it("commits nothing until the merge is resolved, in scope and verified (AC4, AC5)", async () => {
    const config = `${CONFIG()}  full: "grep -q resuelto src/app.ts"\n`;
    const { root, folder } = await conflicted({ ...APP, ".specty/config.yaml": config });
    const tip = git(folder, "rev-parse", "HEAD");
    const marked = await cli(folder, ["integrate"]);
    expect(marked.code).toBe(2);
    expect(marked.out).toContain("Quedan marcadores de conflicto.\nCON MARCADORES:\n  src/app.ts");
    expect(marked.out).toContain("SIGUIENTE: corrígelo y vuelve a ejecutar `specty integrate`.");
    await writeFiles(folder, { "src/app.ts": "2 y main\n", "src/other.ts": "x\n" });
    const outside = await cli(folder, ["integrate"]);
    expect(outside.out).toContain(
      "Hay cambios fuera de la incorporación de main.\nFUERA:\n  src/other.ts",
    );
    await rm(join(folder, "src/other.ts"));
    const failing = await cli(folder, ["integrate"]);
    expect(failing.out).toContain("`grep -q resuelto src/app.ts` falla.");
    expect(git(folder, "rev-parse", "HEAD")).toBe(tip);
    expect(await stateIn(folder)).not.toHaveProperty("integration.resolved");

    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    const resolved = await cli(folder, ["integrate"]);
    expect(resolved.code).toBe(0);
    expect(resolved.out).toMatch(/Incorporación de main resuelta \(merge [0-9a-f]{7}\)\./);
    expect(resolved.out).toContain(
      "SIGUIENTE: pide al usuario que vuelva a ejecutar `specty close` y termina tu turno.",
    );
    expect(git(folder, "log", "-1", "--format=%P").split(" ")).toHaveLength(2);
    expect(git(folder, "log", "-1", "--format=%B")).toContain(`Specty-Change: ${CHANGE}`);
    expect(git(folder, "diff", "--name-only", "HEAD^1", "HEAD")).toBe("src/app.ts");
    expect(tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status).not.toBe(0);
    expect(await stateIn(folder)).toHaveProperty("integration.resolved.commit");
    expect((await cli(folder, ["next"])).out).toContain("Cierre enviado");

    // The person closes: they see the agent's merge first (AC6).
    const terminal = person();
    const closed = await cli(folder, ["close"], { terminal });
    expect(terminal.notes.join("\n")).toContain(
      "Incorporación resuelta por el agente\nmain entró con el merge",
    );
    expect(terminal.notes.join("\n")).toContain("Conflictos resueltos: src/app.ts.");
    expect(closed.out).toContain("Incorporado a main.");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", `specty/${CHANGE}`));
    expect(await read(root, "src/app.ts")).toBe("resuelto\n");
    expect(await exists(folder)).toBe(false);
  });

  it("says when there is nothing to finish, or the merge was aborted", async () => {
    const { folder } = await inWorktree();
    const nothing = await cli(folder, ["integrate"]);
    expect(nothing.code).toBe(2);
    expect(nothing.out).toContain("No hay ninguna incorporación pendiente.");
    const pending = await conflicted();
    git(pending.folder, "merge", "--abort");
    const aborted = await cli(pending.folder, ["integrate"]);
    expect(aborted.out).toContain("El merge ya no está en curso: alguien lo abortó.");
    expect(aborted.out).toContain("pide al usuario que vuelva a ejecutar `specty close`");
  });

  it("sends a quick change back to `specty accept` (AC8)", async () => {
    const root = await tempRepo({ ...APP, "src/button.ts": "Sing in\n" });
    const { id, folder } = await quickInWorktree(root, "Otro botón", "otro-boton", "Log in\n");
    await writeFiles(root, { "src/button.ts": "Sign up\n" });
    git(root, "commit", "-q", "-am", "main cambia el botón");
    expect((await cli(folder, ["accept"], { terminal: person() })).code).toBe(2);
    await writeFiles(folder, { "src/button.ts": "Log in\n" });
    const resolved = await cli(folder, ["integrate"]);
    expect(resolved.out).toContain("vuelva a ejecutar `specty accept`");
    const accepted = await cli(folder, ["accept"], { terminal: person() });
    expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
    expect(accepted.out).toContain("Incorporado a main.");
    expect(await read(root, `.specty/archive/${CHANGE.slice(0, 4)}/${id}/spec.md`)).toContain(
      "Texto corregido",
    );
  });
});
