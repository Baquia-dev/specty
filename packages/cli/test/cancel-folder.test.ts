// SPDX-License-Identifier: Apache-2.0
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

  it("AC2: stays with a file git does not track or a modified one, and the card says why", async () => {
    for (const path of ["notas.txt", "src/app.ts"]) {
      const { root, folder } = await inWorktree();
      await writeFiles(folder, { [path]: "a medias\n" });
      const cancelled = await cancelFrom(root);
      expect(cancelled.code).toBe(0);
      expect(cancelled.out).toContain(
        `La carpeta ${folder} queda: tiene cambios sin commit, que se perderían. Cuando ya no los necesites, descártalos y \`specty prune\` la quitará.`,
      );
      expect(cancelled.out).not.toContain("se eliminó");
      expect(await exists(join(folder, path))).toBe(true);
    }
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

  it("AC3: stays when the agent cancels from inside it, in delegated mode", async () => {
    const { root, folder } = await inWorktree();
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    const cancelled = await cli(folder, ["cancel", "--reason", "Ya no"]);
    expect(cancelled.code).toBe(0);
    expect(cancelled.out).toContain(
      `La carpeta ${folder} queda: una sesión de agente trabaja en ella.`,
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
