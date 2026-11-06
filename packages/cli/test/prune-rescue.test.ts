// SPDX-License-Identifier: Apache-2.0
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CHANGE, cli, git, inWorktree, NOW, person, read, toClosing, writeFiles } from "./support";

const BRANCH = `specty/${CHANGE}`;

/** The rescue ref the clean-up makes for the folder named `name` at `NOW`, in UTC. */
const rescueRef = (name: string) =>
  `refs/specty/rescue/${name}/${NOW.toISOString().replace(/\D/g, "").slice(0, 14)}`;

/** What the change's folder has uncommitted: a tracked file modified and an untracked one. */
const HALF_DONE = {
  "src/app.ts": "export const greet = () => 'a medias';\n",
  "notas.txt": "a medias\n",
};

/**
 * A change closed (delegated mode) whose folder stayed, because it was locked then: the clean-up
 * finds it finished and incorporated.
 */
async function closedFolder() {
  const { root, folder } = await inWorktree();
  await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
  await toClosing(folder);
  git(root, "worktree", "lock", folder);
  expect((await cli(folder, ["close"])).out).toContain(`La carpeta ${folder} queda: `);
  git(root, "worktree", "unlock", folder);
  return { root, folder };
}

const rescueRefs = (root: string) => git(root, "for-each-ref", "refs/specty/rescue/");

describe("the folder of a finished change with something uncommitted", () => {
  it("AC5: goes, after its work goes to a rescue ref on top of its branch, and the output names the ref and how to get it back", async () => {
    const { root, folder } = await closedFolder();
    const tip = git(folder, "rev-parse", "HEAD");
    const main = git(root, "rev-parse", "main");
    await writeFiles(folder, HALF_DONE);
    const pruned = await cli(root, ["prune"]);
    const ref = rescueRef(CHANGE);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain(`CARPETAS BORRADAS:\n  ${folder}\n`);
    expect(pruned.out).toContain(
      `GUARDADO EN REFS DE RESCATE:\n  ${folder}: lo que tenía sin commit quedó en ${ref}; míralo con \`git show ${ref}\` y recupéralo con \`git worktree add <carpeta> ${ref}\`.`,
    );
    expect(await exists(folder)).toBe(false);
    expect(git(root, "rev-parse", `${ref}^`)).toBe(tip);
    expect(git(root, "show", `${ref}:notas.txt`)).toBe("a medias");
    expect(git(root, "show", `${ref}:src/app.ts`)).toBe("export const greet = () => 'a medias';");
    expect(git(root, "log", "-1", "--format=%s", ref)).toBe(
      `wip: lo que ${CHANGE} tenía sin commit al quitar su carpeta`,
    );
    // No branch moved, nor the main folder's index.
    expect(git(root, "rev-parse", "main")).toBe(main);
    expect(git(root, "diff", "--cached", "--name-only")).toBe("");
  });

  it("AC5: stays with what it has, and no rescue ref, while a live conversation works in it", async () => {
    const { root, folder } = await closedFolder();
    await writeFiles(folder, HALF_DONE);
    await writeFiles(root, {
      ".git/common/specty/sessions/s1.json": JSON.stringify({ folder, at: NOW.toISOString() }),
    });
    const pruned = await cli(root, ["prune"]);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain(`  ${folder}: una sesión de agente trabaja en ella.`);
    expect(pruned.out).not.toContain("GUARDADO EN REFS DE RESCATE");
    expect(await read(folder, "notas.txt")).toBe("a medias\n");
    expect(rescueRefs(root)).toBe("");
  });

  it("AC8: stays with what it has when git cannot save it, and the output says why", async (ctx) => {
    // A file git cannot read makes the rescue fail; root reads it anyway.
    if (process.getuid?.() === 0) ctx.skip();
    const { root, folder } = await closedFolder();
    await writeFiles(folder, { ...HALF_DONE, "secreto.txt": "no se lee\n" });
    await chmod(join(folder, "secreto.txt"), 0o000);
    const pruned = await cli(root, ["prune"]);
    await chmod(join(folder, "secreto.txt"), 0o644);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain("QUEDAN:");
    expect(pruned.out).toContain(
      `  ${folder}: lo que tiene no se pudo guardar en una ref de rescate, así que queda: `,
    );
    expect(pruned.out).toContain("secreto.txt");
    expect(pruned.out).not.toContain("GUARDADO EN REFS DE RESCATE");
    expect(pruned.out).not.toContain(`CARPETAS BORRADAS:\n  ${folder}`);
    expect(await read(folder, "notas.txt")).toBe("a medias\n");
    expect(git(folder, "diff", "--name-only")).toBe("src/app.ts");
    expect(git(folder, "diff", "--cached", "--name-only")).toBe("");
    expect(git(folder, "rev-parse", "--abbrev-ref", "HEAD")).toBe(BRANCH);
    expect(rescueRefs(root)).toBe("");
  });
});
