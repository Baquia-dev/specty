// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CHANGE, cli, folderOf, git, inWorktree, person, toClosing } from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
const REMOVED = "CARPETAS DE CAMBIOS TERMINADOS, BORRADAS";

/** A change the agent closed from inside its worktree (delegated mode): the folder stayed. */
async function leftover() {
  const { root, folder } = await inWorktree();
  await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
  await toClosing(folder);
  expect((await cli(folder, ["close"])).out).toContain("queda, porque tu sesión trabaja en ella");
  return { root, folder };
}

describe("folders of finished changes", () => {
  it("go when a new change starts, but not the folder it runs in (AC1, AC3, AC4)", async () => {
    const { root, folder } = await leftover();
    const fromInside = await cli(folder, ["new", "--worktree", "Otro cambio"]);
    expect(fromInside.code).toBe(0);
    expect(fromInside.out).not.toContain(REMOVED);
    expect(await exists(folder)).toBe(true);
    const fromRoot = await cli(root, ["new", "--worktree", "Tercero"]);
    expect(fromRoot.out).toContain(`${REMOVED}:\n  ${folder}`);
    expect(await exists(folder)).toBe(false);
    // The open change's folder and the closed change's branch stay.
    expect(await exists(folderOf(root, OTHER))).toBe(true);
    expect(git(root, "branch", "--list", `specty/${CHANGE}`)).toContain(CHANGE);
    expect((await cli(root, ["new", "--worktree", "Cuarto"])).out).not.toContain(REMOVED);
  });
});
