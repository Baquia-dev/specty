// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, git, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

const FILES = {
  "src/app.ts": "export const greet = () => 'hola';\n",
  ".specty/config.yaml": CONFIG(),
};

describe("a worktree inside the repository", () => {
  it("is not code without a spec, not out of scope and not part of Specty's commits", async () => {
    const root = await tempRepo(FILES);
    // Where Claude Code creates its worktrees.
    git(root, "worktree", "add", "-q", "--detach", ".claude/worktrees/x");
    expect((await cli(root, ["next"])).out).toContain("No hay un cambio activo.");
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code).toBe(0);
    await cli(root, ["next"]);
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name: string) => 'Hola, ' + name;\n",
      "src/app.test.ts": "test\n",
    });
    const done = await cli(root, ["task", "done", "T1", "--summary", "Saludo por nombre"]);
    expect(done.code).toBe(0);
    expect(git(root, "ls-tree", "-r", "--name-only", "HEAD")).not.toContain(".claude");
  });

  it("is told apart from other nested repositories, which still count", async () => {
    const root = await tempRepo(FILES);
    git(root, "init", "-q", "vendor/lib");
    await writeFiles(root, { "vendor/lib/a.ts": "x\n" });
    git(`${root}/vendor/lib`, "add", "-A");
    git(`${root}/vendor/lib`, "commit", "-q", "-m", "init");
    expect((await cli(root, ["next"])).out).toContain("CAMBIOS SIN SPEC:\n  vendor/lib/");
  });
});
