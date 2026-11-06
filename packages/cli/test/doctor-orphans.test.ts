// SPDX-License-Identifier: Apache-2.0
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, cli, git, inWorktree, person, tempRepo, toClosing, writeFiles } from "./support";

/** The line of `status` with how many orphans `specty prune` removes. */
const statusLine = (count: number) =>
  `LIMPIEZA:\n  Huérfanos que quita \`specty prune\`: ${count} (registros de worktrees sin carpeta y carpetas que sobran); \`specty doctor\` los cuenta por tipo.`;

/** The start of each line `doctor` gives of the orphans and the rescue refs. */
const DOCTOR_STARTS = [
  "Registros de git de worktrees cuya carpeta ya no existe:",
  "Carpetas de cambios terminados que ya no hacen falta:",
  "Carpetas fantasma, que no son worktrees de git,",
  "Carpetas vacías en .specty/changes/:",
  "Refs de rescate,",
];

/**
 * A change closed (delegated mode) whose folder stayed, because it was locked then: the clean-up
 * would find it finished and incorporated.
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

describe("doctor and status with orphans", () => {
  it("AC9: count the records of worktrees whose folder is gone, but not a locked one, which `specty prune` keeps", async () => {
    const root = await tempRepo(APP);
    for (const name of ["ida", "otra", "guardada"]) {
      git(root, "worktree", "add", "-q", "-b", name, join(root, ".worktrees", name));
    }
    git(root, "worktree", "lock", join(root, ".worktrees", "guardada"));
    await rm(join(root, ".worktrees"), { recursive: true, force: true });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.out).toContain(
      "  Registros de git de worktrees cuya carpeta ya no existe: 2; los olvida `specty prune`.",
    );
    expect((await cli(root, ["status"])).out).toContain(statusLine(2));
  });

  it("AC9: count the folders of finished changes that `specty prune` would remove", async () => {
    const { root } = await closedFolder();
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.out).toContain(
      "  Carpetas de cambios terminados que ya no hacen falta: 1; las quita `specty prune`, tras guardar en una ref de rescate lo que tengan sin commit.",
    );
  });

  it("AC9: count the ghost folders and the empty folders of `.specty/changes/`, each kind in its line", async () => {
    const root = await tempRepo(APP);
    await writeFiles(join(root, ".worktrees", "viejo"), { "notas.txt": "a medias\n" });
    await writeFiles(join(root, ".worktrees", "otro"), { "notas.txt": "olvidado\n" });
    await mkdir(join(root, ".specty", "changes", "20261031-vacia", "revisions"), {
      recursive: true,
    });
    await mkdir(join(root, ".specty", "changes", "20261031-otra"), { recursive: true });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.out).toContain(
      "  Carpetas fantasma, que no son worktrees de git, en .worktrees/ o en la carpeta hermana: 2; las borra `specty prune`, tras guardar en una ref de rescate lo que git no ignora de ellas.",
    );
    expect(doctor.out).toContain(
      "  Carpetas vacías en .specty/changes/: 2; las borra `specty prune`.",
    );
    expect((await cli(root, ["status"])).out).toContain(statusLine(4));
  });

  it("AC9: say nothing of them when there are none", async () => {
    const { root } = await inWorktree();
    const doctor = await cli(root, ["doctor"]);
    for (const start of DOCTOR_STARTS) expect(doctor.out).not.toContain(start);
    expect((await cli(root, ["status"])).out).not.toContain("LIMPIEZA");
  });
});

describe("doctor with rescue refs", () => {
  it("AC10: says how many there are, with how to see the latest and get it back", async () => {
    const root = await tempRepo(APP);
    for (const ref of ["viejo/20261104100000", "otro/20261106090000", "viejo/20261105100000"]) {
      git(root, "update-ref", `refs/specty/rescue/${ref}`, "HEAD");
    }
    const latest = "refs/specty/rescue/otro/20261106090000";
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.out).toContain(
      `  Refs de rescate, con lo que guardó la limpieza de las carpetas que quitó: 3. La más reciente es ${latest}: mírala con \`git show ${latest}\` y recupérala con \`git worktree add <carpeta> ${latest}\`; lista las demás con \`git for-each-ref refs/specty/rescue/\`. Quedan hasta que las borres con \`git update-ref -d <ref>\`.`,
    );
    // They are no orphans: `status` does not count them.
    expect((await cli(root, ["status"])).out).not.toContain("LIMPIEZA");
  });
});
