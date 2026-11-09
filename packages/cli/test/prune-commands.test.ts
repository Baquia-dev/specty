// SPDX-License-Identifier: Apache-2.0
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { APP, cli, git, inWorktree, person, tempRepo, toClosing, worktreeList } from "./support";

/** A record git keeps of a worktree whose folder is gone, made with git alone; its folder. */
async function staleRecord(root: string, name: string): Promise<string> {
  const folder = join(root, ".worktrees", name);
  git(root, "worktree", "add", "-q", "-b", name, folder);
  await rm(folder, { recursive: true, force: true });
  return folder;
}

const listed = (root: string) => worktreeList(root);

describe("the commands that clean up when they end", () => {
  it("AC4: `new` forgets the records of worktrees whose folder is gone", async () => {
    const root = await tempRepo(APP);
    const gone = await staleRecord(root, "gone");
    expect(listed(root)).toContain(gone);
    const created = await cli(root, ["new", "--worktree", "Saludo personalizado"]);
    expect(created.code).toBe(0);
    expect(listed(root)).not.toContain(gone);
  });

  it("AC4: `cancel` forgets them too, also when it runs inside the folder it removes", async () => {
    const { root, folder } = await inWorktree();
    const gone = await staleRecord(root, "gone");
    const cancelled = await cli(folder, ["cancel", "--reason", "Ya no"], { terminal: person() });
    expect(cancelled.code).toBe(0);
    expect(await exists(folder)).toBe(false);
    expect(listed(root)).not.toContain(gone);
  });

  it("AC4: `close` forgets them too, from the main folder once the change's folder is gone", async () => {
    const { root, folder } = await inWorktree();
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    await toClosing(folder);
    const gone = await staleRecord(root, "gone");
    const closed = await cli(folder, ["close"]);
    expect(closed.code).toBe(0);
    expect(await exists(folder)).toBe(false);
    expect(listed(root)).not.toContain(gone);
  });
});
