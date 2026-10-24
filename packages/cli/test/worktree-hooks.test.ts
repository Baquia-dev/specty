// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, git, tempRepo, tryGit } from "./support";

/** Claude Code's `WorktreeCreate` or `WorktreeRemove`, run from `cwd`. */
const hook = (cwd: string, event: string, input: Record<string, unknown>) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ session_id: "s1", cwd, hook_event_name: event, ...input }),
  });

const listed = (root: string) => git(root, "worktree", "list", "--porcelain");

describe("Claude Code's worktree hooks", () => {
  it("answer a change's id with the folder `specty new` prepared, creating nothing (AC1)", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    const before = listed(root);
    const created = await hook(root, "WorktreeCreate", { name: CHANGE });
    expect(created).toMatchObject({ code: 0, out: folderOf(root), err: "" });
    expect(listed(root)).toBe(before);
  });

  it("create any other name in `.claude/worktrees` from HEAD, and reuse it (AC2)", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    const folder = join(root, ".claude", "worktrees", "explorar", "a");
    const created = await hook(root, "WorktreeCreate", { name: "explorar/a" });
    expect(created).toMatchObject({ code: 0, out: folder });
    expect(git(folder, "branch", "--show-current")).toBe("worktree-explorar-a");
    expect(git(folder, "rev-parse", "HEAD")).toBe(git(root, "rev-parse", "HEAD"));
    expect((await hook(root, "WorktreeCreate", { name: "explorar/a" })).out).toBe(folder);
    // A branch left behind by a removed worktree is checked out again.
    git(root, "worktree", "remove", folder);
    expect((await hook(root, "WorktreeCreate", { name: "explorar/a" })).out).toBe(folder);
    for (const name of ["", "../fuera", "a//b", "."]) {
      const refused = await hook(root, "WorktreeCreate", { name });
      expect(refused.code).toBe(1);
      expect(refused.out).toBe("");
    }
  });

  it("remove Claude Code's worktrees, with their merged branch, and keep Specty's (AC3)", async () => {
    const root = await tempRepo(APP);
    const merged = (await hook(root, "WorktreeCreate", { name: "limpia" })).out;
    expect((await hook(root, "WorktreeRemove", { worktree_path: merged })).code).toBe(0);
    expect(listed(root)).not.toContain(merged);
    expect(tryGit(root, "rev-parse", "--verify", "-q", "worktree-limpia").status).not.toBe(0);
    const worked = (await hook(root, "WorktreeCreate", { name: "con-trabajo" })).out;
    git(worked, "commit", "-q", "--allow-empty", "-m", "trabajo");
    expect((await hook(root, "WorktreeRemove", { worktree_path: worked })).code).toBe(0);
    expect(tryGit(root, "rev-parse", "--verify", "-q", "worktree-con-trabajo").status).toBe(0);
    await cli(root, ["new", "--worktree", "Saludo personalizado"]);
    const kept = await hook(root, "WorktreeRemove", { worktree_path: folderOf(root) });
    expect(kept.code).toBe(1);
    expect(kept.err).toContain(`${folderOf(root)} es la carpeta de un cambio de Specty: se queda`);
    expect(listed(root)).toContain(folderOf(root));
    expect((await hook(root, "WorktreeRemove", {})).code).toBe(1);
    // `close` already removed a merged change's folder: leaving it with `remove` is fine.
    const gone = `${folderOf(root)}-cerrada`;
    expect(await hook(root, "WorktreeRemove", { worktree_path: gone })).toMatchObject({ code: 0 });
  });
});
