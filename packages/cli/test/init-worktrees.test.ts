// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cli, git, read, tempRepo } from "./support";

const INIT = ["init", "--language", "es", "--tools", "claude-code"];
const LINE =
  "`.gitignore` ignora `.worktrees/`, donde viven las carpetas de los cambios (ADR 0018).";
/** The files of the last commit. */
const committed = (root: string) =>
  git(root, "show", "--name-only", "--format=", "HEAD").split("\n");

describe("init and the worktrees' folder in .gitignore", () => {
  it("AC1: adds /.worktrees/ at the end of .gitignore, says so and commits it", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".gitignore": "node_modules/\ndist/" });
    const result = await cli(root, INIT);
    expect(result.code).toBe(0);
    expect(result.out).toContain(LINE);
    expect(await read(root, ".gitignore")).toBe("node_modules/\ndist/\n/.worktrees/\n");
    expect(committed(root)).toContain(".gitignore");
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("AC1: creates .gitignore with the line when the project has none", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    expect((await cli(root, INIT)).code).toBe(0);
    expect(await read(root, ".gitignore")).toBe("/.worktrees/\n");
    expect(committed(root)).toContain(".gitignore");
  });

  it("AC2: leaves a .gitignore that already ignores it, and adds nothing the next time", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".gitignore": "dist/\n.worktrees\n" });
    const first = await cli(root, INIT);
    expect(first.out).not.toContain(LINE);
    expect(await read(root, ".gitignore")).toBe("dist/\n.worktrees\n");
    const fresh = await tempRepo({ "src/app.ts": "x\n" });
    await cli(fresh, INIT);
    const again = await cli(fresh, INIT);
    expect(again.out).not.toContain(LINE);
    expect(await read(fresh, ".gitignore")).toBe("/.worktrees/\n");
  });
});
