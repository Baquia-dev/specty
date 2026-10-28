// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { exists } from "../src/io/files";
import { cli, git, read, tempRepo, writeFiles } from "./support";

const CODE = { "src/app.ts": "export const a = 1;\n" };
const init = (root: string, ...flags: string[]) =>
  cli(root, ["init", "--language", "es", "--tools", "claude-code", ...flags]);
const configOf = async (root: string) => read(root, ".specty/config.yaml");

describe("init --git-flow", () => {
  it("creates the configuration with the flow, and says how branches will be named (AC1)", async () => {
    const root = await tempRepo(CODE);
    const done = await init(root, "--git-flow", "github");
    expect(done.code).toBe(0);
    expect(parse(await configOf(root)).git).toMatchObject({
      branchPerChange: true,
      flow: "github",
    });
    expect(done.out).toContain(
      ".specty/config.yaml: git.flow es github; las ramas de los cambios serán <tipo>/<slug>, como feat/<slug>.",
    );
  });

  it("changes only the flow of an existing configuration, and leaves it alone without the flag (AC2, AC3)", async () => {
    const root = await tempRepo(CODE);
    await init(root);
    const mine = `# Mía\n${await configOf(root)}`;
    await writeFiles(root, { ".specty/config.yaml": mine });
    const trunk = await init(root, "--git-flow", "trunk");
    expect(trunk.out).toContain(".specty/config.yaml: git.flow es trunk;");
    expect(await configOf(root)).toBe(
      mine.replace("  branchPerChange: true\n", "  branchPerChange: true\n  flow: trunk\n"),
    );
    // Git Flow replaces the value, and goes to develop when the configuration names no target.
    await init(root, "--git-flow", "gitflow");
    expect(await configOf(root)).toBe(
      mine.replace(
        "  branchPerChange: true\n",
        "  branchPerChange: true\n  flow: gitflow\n  target: develop\n",
      ),
    );
    const again = await init(root);
    expect(again.out).toContain(".specty/config.yaml ya existía; no se tocó.");
    expect(parse(await configOf(root)).git.flow).toBe("gitflow");
  });

  it("keeps the target the configuration already has (AC3)", async () => {
    const root = await tempRepo(CODE);
    await init(root);
    await writeFiles(root, {
      ".specty/config.yaml": `${await configOf(root)}  target: main\n`,
    });
    await init(root, "--git-flow", "gitflow");
    expect(parse(await configOf(root)).git).toMatchObject({ flow: "gitflow", target: "main" });
  });

  it("installs nothing for an unknown flow, and names the valid ones (AC5)", async () => {
    const root = await tempRepo(CODE);
    const refused = await init(root, "--git-flow", "svn");
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("Flujo de git desconocido: svn.");
    expect(refused.out).toContain("--git-flow specty|github|trunk|gitflow");
    expect(await exists(`${root}/.specty/config.yaml`)).toBe(false);
  });
});

describe("init --git-flow gitflow and develop", () => {
  const develop = (root: string) => git(root, "branch", "--list", "develop");

  it("creates develop from where init committed, and says so (AC4)", async () => {
    const root = await tempRepo(CODE);
    const done = await init(root, "--git-flow", "gitflow");
    expect(done.out).toContain(
      "Rama develop creada desde main: ahí empiezan y terminan los cambios.",
    );
    expect(git(root, "rev-parse", "develop")).toBe(git(root, "rev-parse", "main"));
    expect(git(root, "log", "-1", "--format=%s", "develop")).toContain("Specty");
    // An existing develop stays as it is.
    expect((await init(root, "--git-flow", "gitflow")).out).not.toContain("Rama develop creada");
  });

  it("takes the remote's develop when there is one (AC4)", async () => {
    const root = await tempRepo(CODE);
    const before = git(root, "rev-parse", "HEAD");
    git(root, "remote", "add", "origin", "https://example.com/app.git");
    git(root, "update-ref", "refs/remotes/origin/develop", before);
    const done = await init(root, "--git-flow", "gitflow");
    expect(done.out).toContain("Rama develop creada desde origin/develop");
    expect(git(root, "rev-parse", "develop")).toBe(before);
    // It follows the remote's.
    expect(git(root, "config", "--get", "branch.develop.merge")).toBe("refs/heads/develop");
  });

  it("creates no branch in a dry run, nor when changes go elsewhere (AC4)", async () => {
    const dry = await tempRepo(CODE);
    await init(dry, "--git-flow", "gitflow", "--dry-run");
    expect(develop(dry)).toBe("");
    const elsewhere = await tempRepo(CODE);
    await init(elsewhere);
    await writeFiles(elsewhere, {
      ".specty/config.yaml": `${await configOf(elsewhere)}  target: main\n`,
    });
    await init(elsewhere, "--git-flow", "gitflow");
    expect(develop(elsewhere)).toBe("");
  });
});
