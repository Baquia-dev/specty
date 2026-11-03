// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, folderOf, git, read, tempRepo, writeFiles } from "./support";

/** Go's workspace files: Go finds them going up from the folder it runs in. */
const GO_WORK = "go 1.27\n\nuse (\n\t./a\n\t./b\n)\n";
const GO_SUM = "example.com/a v1.0.0 h1:abc=\n";
const WORKSPACE = { "go.work": GO_WORK, "go.work.sum": GO_SUM };

const SECTION = "WORKSPACE DE GO COPIADO:\n  go.work\n  go.work.sum";

/**
 * `new --worktree` in a repository with `committed` in its commit and `untracked` written after it,
 * in the main folder.
 */
async function created(
  committed: Readonly<Record<string, string>>,
  untracked: Readonly<Record<string, string>> = {},
) {
  const root = await tempRepo({ ...APP, ...committed });
  await writeFiles(root, untracked);
  const run = await cli(root, ["new", "--worktree", "Saludo personalizado"]);
  expect(run.code).toBe(0);
  return { root, folder: folderOf(root), out: run.out };
}

const excludeLines = async (root: string) =>
  (await read(root, join(".git", "info", "exclude"))).split("\n");

describe("new and Go's workspace files the main folder does not version", () => {
  it("AC1: copies go.work and go.work.sum into the change's worktree, and names them", async () => {
    const { folder, out } = await created({}, WORKSPACE);
    expect(await read(folder, "go.work")).toBe(GO_WORK);
    expect(await read(folder, "go.work.sum")).toBe(GO_SUM);
    expect(out).toContain(SECTION);
  });

  it("AC2: ignores the copies in the clone when nothing ignored them, and only then", async () => {
    const { root, folder, out } = await created({}, WORKSPACE);
    expect(await excludeLines(root)).toEqual(expect.arrayContaining(["/go.work", "/go.work.sum"]));
    expect(out).toContain(
      `${SECTION}\n  Specty los ignora en el clon (\`.git/info/exclude\`) para que no entren en el cambio; para versionarlos, quita esas líneas.`,
    );
    expect(git(folder, "status", "--porcelain")).not.toContain("go.work");

    // The same card, in English.
    const english = await created(
      { ".specty/config.yaml": CONFIG().replace("language: es", "language: en") },
      WORKSPACE,
    );
    expect(english.out).toContain(
      "GO WORKSPACE COPIED:\n  go.work\n  go.work.sum\n  Specty ignores them in the clone (`.git/info/exclude`) so they stay out of the change; to version them, remove those lines.",
    );

    // Already ignored by .gitignore: copied, with no lines added.
    const ignored = await created({ ".gitignore": "go.work\ngo.work.sum\n" }, WORKSPACE);
    expect(await read(ignored.folder, "go.work")).toBe(GO_WORK);
    expect(ignored.out).toContain(SECTION);
    expect(ignored.out).not.toContain(".git/info/exclude");
    const lines = await excludeLines(ignored.root);
    expect(lines).not.toContain("/go.work");
    expect(lines).not.toContain("/go.work.sum");
    expect(git(ignored.folder, "status", "--porcelain")).not.toContain("go.work");
  });

  it("AC3: copies nothing of Go when go.work is versioned, or there is none", async () => {
    const versioned = await created(WORKSPACE);
    expect(versioned.out).not.toContain("WORKSPACE DE GO");
    // It arrives with the branch.
    expect(await read(versioned.folder, "go.work")).toBe(GO_WORK);
    expect(await excludeLines(versioned.root)).not.toContain("/go.work");

    const none = await created({});
    expect(none.out).not.toContain("WORKSPACE DE GO");
  });
});
