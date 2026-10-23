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
