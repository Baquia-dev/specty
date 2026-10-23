// SPDX-License-Identifier: Apache-2.0
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGE, cli, folderOf, inWorktree, person, SPEC, SPEC_PATH, writeFiles } from "./support";

const BRANCH = `specty/${CHANGE}`;
const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");

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
