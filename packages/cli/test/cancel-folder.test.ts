// SPDX-License-Identifier: Apache-2.0
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  APP,
  ARCHIVE,
  CHANGE,
  cli,
  git,
  inWorktree,
  NOW,
  person,
  tempRepo,
  toAcceptance,
  writeFiles,
} from "./support";

const BRANCH = `specty/${CHANGE}`;

/** The person cancels the change from the main folder, naming it. */
const cancelFrom = (root: string) =>
  cli(root, ["cancel", CHANGE, "--reason", "Ya no"], { terminal: person() });

describe("the folder of a cancelled change", () => {
  it("AC1: goes with what git ignores, and its branch keeps the archived change", async () => {
    const { root, folder } = await inWorktree({ ...APP, ".gitignore": "node_modules/\n" });
    await writeFiles(folder, { "node_modules/x/index.js": "module.exports = 1;\n" });
    const cancelled = await cancelFrom(root);
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain(
      `La carpeta ${folder} se eliminó y la rama ${BRANCH} queda; sigue en ${root}.`,
    );
    expect(await exists(folder)).toBe(false);
    expect(git(root, "ls-tree", "-r", "--name-only", BRANCH)).toContain(
      `${ARCHIVE}/${CHANGE}/state.json`,
    );
  });

  it("AC1: goes when the person cancels from inside it, and the branch keeps the done tasks", async () => {
    const { root, folder } = await inWorktree();
    await toAcceptance(folder);
    const cancelled = await cli(folder, ["cancel", "--reason", "Ya no"], { terminal: person() });
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain(
      `La carpeta ${folder} se eliminó y la rama ${BRANCH} queda; sigue en ${root}.`,
    );
    expect(await exists(folder)).toBe(false);
    expect(git(root, "show", `${BRANCH}:src/app.ts`)).toBe("2");
  });

  it("AC3: stays while an agent session works in it", async () => {
    const { root, folder } = await inWorktree();
    // The guard's record of a session that entered the folder.
    await writeFiles(root, {
      ".git/common/specty/sessions/s1.json": JSON.stringify({ folder, at: NOW.toISOString() }),
    });
    const cancelled = await cancelFrom(root);
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain(
      `La carpeta ${folder} queda: una sesión de agente trabaja en ella. \`specty prune\` la quitará cuando ya ninguna sesión trabaje en ella.`,
    );
    expect(await exists(folder)).toBe(true);
  });

  it("AC4: stays when git cannot remove it, and prune removes it later", async () => {
    const { root, folder } = await inWorktree();
    git(root, "worktree", "lock", folder);
    const cancelled = await cancelFrom(root);
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain(`La carpeta ${folder} queda: `);
    expect(cancelled.out).toContain("Bórrala con `git worktree remove` cuando ya no la necesites.");
    expect(await exists(folder)).toBe(true);
    git(root, "worktree", "unlock", folder);
    const pruned = await cli(root, ["prune"]);
    expect(pruned.out).toContain(`CARPETAS BORRADAS:\n  ${folder}`);
    expect(await exists(folder)).toBe(false);
  });

  it("AC5: is not touched when the change lives in the main folder", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    const cancelled = await cli(root, ["cancel", "--reason", "Ya no"], { terminal: person() });
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain("Cambio cancelado y archivado");
    expect(cancelled.out).not.toContain("La carpeta");
    expect(await exists(join(root, "src/app.ts"))).toBe(true);
  });
});

/** What Claude Code tells the commands of conversation s1. */
const CLAUDE = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s1" };

/** The agent, in delegated mode, cancels the change from inside its folder. */
async function agentCancels(root: string, folder: string) {
  await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
  return cli(folder, ["cancel", "--reason", "Ya no"], { env: CLAUDE });
}

describe("the folder the agent cancels from inside, in delegated mode", () => {
  it("AC1: goes, also with its own session bound to it, and SIGUIENTE asks to leave it as close does", async () => {
    const { root, folder } = await inWorktree();
    // The guard's record of the agent's own session, which entered the folder.
    await writeFiles(root, {
      ".git/common/specty/sessions/s1.json": JSON.stringify({ folder, at: NOW.toISOString() }),
    });
    const cancelled = await agentCancels(root, folder);
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain(
      `La carpeta ${folder} se eliminó y la rama ${BRANCH} queda; sigue en ${root}.`,
    );
    expect(cancelled.out).toContain(
      `SIGUIENTE: ${folder} ya no existe: sal de ella (en Claude Code, \`ExitWorktree\`) y sigue en ${root}; para otro cambio, \`specty new "<título>"\`.`,
    );
    expect(await exists(folder)).toBe(false);
    expect(git(root, "ls-tree", "-r", "--name-only", BRANCH)).toContain(
      `${ARCHIVE}/${CHANGE}/state.json`,
    );
  });
});

/** What the change's folder has uncommitted: a tracked file modified and an untracked one. */
const HALF_DONE = {
  "src/app.ts": "export const greet = () => 'a medias';\n",
  "notas.txt": "a medias\n",
};

/** The card's line with the commit that keeps what the folder had uncommitted. */
const savedLine = (root: string) =>
  `Lo que la carpeta tenía sin commit quedó en el commit ${git(root, "rev-parse", "--short=7", BRANCH)} de la rama ${BRANCH}.`;

describe("the uncommitted work of a cancelled change's folder", () => {
  it("AC1: goes into a commit of the branch after the archive's, and the folder goes", async () => {
    const { root, folder } = await inWorktree();
    await writeFiles(folder, HALF_DONE);
    const cancelled = await cancelFrom(root);
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain(savedLine(root));
    expect(cancelled.out).toContain(
      `La carpeta ${folder} se eliminó y la rama ${BRANCH} queda; sigue en ${root}.`,
    );
    expect(await exists(folder)).toBe(false);
    expect(git(root, "log", "-2", "--format=%s", BRANCH).split("\n")).toEqual([
      `wip: lo que ${CHANGE} tenía sin commit al cancelarse`,
      `docs(spec): cancelar ${CHANGE}`,
    ]);
    expect(git(root, "show", `${BRANCH}:src/app.ts`)).toBe(
      "export const greet = () => 'a medias';",
    );
    expect(git(root, "show", `${BRANCH}:notas.txt`)).toBe("a medias");
  });

  it("AC2: goes when the agent cancels from inside, and SIGUIENTE asks to leave the folder that no longer exists", async () => {
    const { root, folder } = await inWorktree();
    await writeFiles(folder, HALF_DONE);
    const cancelled = await agentCancels(root, folder);
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain(savedLine(root));
    expect(cancelled.out).toContain(
      `SIGUIENTE: ${folder} ya no existe: sal de ella (en Claude Code, \`ExitWorktree\`) y sigue en ${root}; para otro cambio, \`specty new "<título>"\`.`,
    );
    expect(await exists(folder)).toBe(false);
    expect(git(root, "show", `${BRANCH}:notas.txt`)).toBe("a medias");
  });

  it("AC3: goes into a commit while an agent session works in the folder, which stays until prune", async () => {
    const { root, folder } = await inWorktree();
    await writeFiles(folder, HALF_DONE);
    const record = ".git/common/specty/sessions/s1.json";
    await writeFiles(root, { [record]: JSON.stringify({ folder, at: NOW.toISOString() }) });
    const cancelled = await cancelFrom(root);
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain(savedLine(root));
    expect(cancelled.out).toContain(
      `La carpeta ${folder} queda: una sesión de agente trabaja en ella.`,
    );
    expect(await exists(folder)).toBe(true);
    expect(git(folder, "status", "--porcelain")).toBe("");
    // Two days later, that session no longer counts.
    const old = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await writeFiles(root, { [record]: JSON.stringify({ folder, at: old }) });
    const pruned = await cli(root, ["prune"]);
    expect(pruned.out).toContain(`CARPETAS BORRADAS:\n  ${folder}`);
    expect(await exists(folder)).toBe(false);
  });

  it("AC4: stays in the folder, with nothing staged, when git cannot commit it", async (ctx) => {
    // A file git cannot read makes `git add` fail; root reads it anyway.
    if (process.getuid?.() === 0) ctx.skip();
    const { root, folder } = await inWorktree();
    await writeFiles(folder, { ...HALF_DONE, "secreto.txt": "no se lee\n" });
    await chmod(join(folder, "secreto.txt"), 0o000);
    const cancelled = await cancelFrom(root);
    await chmod(join(folder, "secreto.txt"), 0o644);
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain(
      `La carpeta ${folder} queda: tiene cambios sin commit, que se perderían.`,
    );
    expect(cancelled.out).not.toContain("quedó en el commit");
    expect(await exists(join(folder, "notas.txt"))).toBe(true);
    expect(git(folder, "diff", "--cached", "--name-only")).toBe("");
    expect(git(folder, "diff", "--name-only")).toBe("src/app.ts");
    expect(git(root, "log", "-1", "--format=%s", BRANCH)).toBe(`docs(spec): cancelar ${CHANGE}`);
  });
});
