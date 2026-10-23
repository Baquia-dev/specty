// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
    expect(committed(root)).toEqual([".specty/config.yaml", "AGENTS.md", "CLAUDE.md"]);
    expect(result.out).toMatch(
      /Commit [0-9a-f]{7}: \.specty\/config\.yaml, AGENTS\.md, CLAUDE\.md\./,
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
