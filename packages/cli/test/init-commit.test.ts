// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { createGit } from "../src/io/git";
import { addReceipt } from "../src/store/local";
import { CONFIG, cli, git, NOW, read, tempRepo, writeFiles } from "./support";

describe("the commit of Specty's installation", () => {
  it("passes the git hooks with an init receipt and names no change (AC1)", async () => {
    const root = await tempRepo({
      ".specty/config.yaml": CONFIG(),
      ".claude/settings.json": "{}\n",
    });
    await writeFiles(root, { ".claude/settings.json": '{"hooks":{}}\n' });
    git(root, "add", ".claude/settings.json");
    // Governed and outside any change: blocked without a receipt.
    expect((await cli(root, ["hook", "pre-commit"])).code).toBe(1);
    const repo = createGit(root);
    const tree = await repo.writeTree();
    await addReceipt(repo, { tree, change: "", kind: "init", createdAt: NOW.toISOString() });
    expect((await cli(root, ["hook", "pre-commit"])).code).toBe(0);
    const message = join(root, ".git", "MSG");
    await writeFile(
      message,
      "chore(specty): actualizar la instalación de Specty\n\nSpecty-Init: true\n",
    );
    expect((await cli(root, ["hook", "prepare-commit-msg", message, "message"])).code).toBe(0);
    expect(await read(root, ".git/MSG")).toBe(
      "chore(specty): actualizar la instalación de Specty\n\nSpecty-Init: true\n",
    );
  });
});

const INIT = ["init", "--language", "es", "--tools", "claude-code"];
/** The files of the last commit. */
const committed = (root: string) =>
  git(root, "show", "--name-only", "--format=", "HEAD").split("\n");

/** A repository where Specty is installed and committed by `init`. */
async function installed(): Promise<string> {
  const root = await tempRepo({ "src/app.ts": "x\n" });
  expect((await cli(root, INIT)).code).toBe(0);
  return root;
}

/** Takes Specty's flow block out of AGENTS.md in a commit of the person's, so `init` restores it. */
async function dropFlowBlock(root: string): Promise<void> {
  const text = await read(root, "AGENTS.md");
  await writeFiles(root, { "AGENTS.md": text.replace(/<!-- specty:begin id=flow -->[\s\S]*/, "") });
  git(root, "commit", "-q", "-am", "docs: sin bloque de flujo");
}

describe("specty init commits what it writes", () => {
  it("installs in one commit through the installed hooks, leaving the folder clean (AC1)", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    const result = await cli(root, INIT);
    expect(result.code).toBe(0);
    expect(git(root, "log", "-1", "--format=%s%n%n%b")).toBe(
      "chore(specty): instalar Specty\n\nSpecty-Init: true",
    );
    expect(committed(root)).toEqual([
      ".gitignore",
      ".specty/config.yaml",
      "AGENTS.md",
      "CLAUDE.md",
      "docs/dominio.md",
    ]);
    expect(result.out).toMatch(
      /Commit [0-9a-f]{7}: \.gitignore, \.specty\/config\.yaml, AGENTS\.md, CLAUDE\.md, docs\/dominio\.md\./,
    );
    // The machine-specific hook file and the native git hooks stay local.
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("commits only what changed when run again, and nothing when nothing did (AC2)", async () => {
    const root = await installed();
    const head = git(root, "rev-parse", "HEAD");
    const again = await cli(root, INIT);
    expect(again.out).not.toContain("Commit ");
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    await dropFlowBlock(root);
    await cli(root, INIT);
    expect(git(root, "log", "-1", "--format=%s")).toBe(
      "chore(specty): actualizar la instalación de Specty",
    );
    expect(committed(root)).toEqual(["AGENTS.md"]);
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("leaves out a file the person had changed and whatever they staged (AC3, AC4)", async () => {
    const root = await installed();
    await dropFlowBlock(root);
    await writeFiles(root, { "src/app.ts": "y\n" });
    git(root, "add", "src/app.ts");
    // Untouched by the person, but committed by them without Specty's import: init restores it.
    await writeFiles(root, { "CLAUDE.md": "# Proyecto\n" });
    git(root, "commit", "-q", "-m", "docs: claude", "--", "CLAUDE.md");
    await writeFiles(root, { "AGENTS.md": `${await read(root, "AGENTS.md")}\nNota mía.\n` });
    const result = await cli(root, INIT);
    expect(committed(root)).toEqual(["CLAUDE.md"]);
    expect(result.out).toContain("Ya tenían cambios tuyos y quedan sin commit: AGENTS.md.");
    expect(await read(root, "AGENTS.md")).toContain("Nota mía.");
    expect(git(root, "diff", "--cached", "--name-only")).toBe("src/app.ts");
  });

  it("commits with another change's worktree in .worktrees/, which git ignores", async () => {
    const root = await installed();
    await dropFlowBlock(root);
    // What `specty new` leaves: the change's worktree inside, ignored by `.git/info/exclude`.
    await writeFiles(root, { ".git/info/exclude": "/.worktrees/\n" });
    git(root, "worktree", "add", "-q", "--detach", ".worktrees/otro-cambio");
    const result = await cli(root, INIT);
    expect(result.code).toBe(0);
    expect(committed(root)).toEqual(["AGENTS.md"]);
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("does not commit in a folder with a change in progress (AC5)", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    const head = git(root, "rev-parse", "HEAD");
    const result = await cli(root, INIT);
    expect(result.out).toContain("Esta carpeta tiene un cambio activo");
    expect(result.out).toContain("Ejecuta `specty init` en la carpeta principal.");
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
  });
});

/** Makes `git commit` fail in `root` without touching the index: it signs with a program that fails. */
function failingCommits(root: string): void {
  git(root, "config", "commit.gpgsign", "true");
  git(root, "config", "gpg.program", "false");
}

const FAILED = "No se pudo hacer el commit de lo instalado (git commit: error: gpg failed to sign";

describe("specty init when its commit fails", () => {
  it("AC1: says why instead of a trace, and ends with an error", async () => {
    const root = await installed();
    await dropFlowBlock(root);
    failingCommits(root);
    const result = await cli(root, INIT);
    expect(result.code).toBe(1);
    expect(result.out).toContain(FAILED);
    expect(result.out).toContain("; se deshizo lo escrito en AGENTS.md.");
    expect(result.out).toContain(
      "SIGUIENTE: corrige lo que impidió el commit (en AVISOS) y vuelve a ejecutar `specty init`.",
    );
    expect(`${result.out}${result.err}`).not.toMatch(/GitError|hint:|\n\s+at /);
  });

  it("AC2: undoes what it wrote, leaves the person's changes, and commits once run again", async () => {
    const root = await installed();
    await dropFlowBlock(root);
    const head = git(root, "rev-parse", "HEAD");
    const dropped = await read(root, "AGENTS.md");
    await writeFiles(root, { "src/app.ts": "y\n" });
    failingCommits(root);
    expect((await cli(root, INIT)).code).toBe(1);
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    expect(await read(root, "AGENTS.md")).toBe(dropped);
    expect(await read(root, "src/app.ts")).toBe("y\n");
    expect(git(root, "status", "--porcelain")).toBe("M src/app.ts");
    git(root, "config", "--unset", "commit.gpgsign");
    expect((await cli(root, INIT)).code).toBe(0);
    expect(committed(root)).toEqual(["AGENTS.md"]);
  });

  it("AC2: on the first installation, deletes the files it created and stages nothing", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    failingCommits(root);
    const result = await cli(root, INIT);
    expect(result.code).toBe(1);
    const created = [
      ".gitignore",
      ".specty/config.yaml",
      "AGENTS.md",
      "CLAUDE.md",
      "docs/dominio.md",
    ];
    expect(result.out).toContain(`; se deshizo lo escrito en ${created.join(", ")}.`);
    for (const path of created) expect(await exists(join(root, path))).toBe(false);
    expect(git(root, "diff", "--cached", "--name-only")).toBe("");
  });
});
