// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { APP, CHANGE, cli, folderOf, git, read, stateIn, tempRepo } from "./support";

/** A repository whose changes go in worktrees, with branches named as `flow` says. */
const repo = (flow: string) =>
  tempRepo({
    ...APP,
    ".specty/config.yaml": `version: 1\nlanguage: es\ngit:\n  flow: ${flow}\nverify:\n  default: "true"\n`,
  });
const idOf = (slug: string) => `${CHANGE.slice(0, 8)}-${slug}`;
const LOGIN = idOf("login-con-google");
/** What git's configuration ties `branch` to. */
const markOf = (root: string, branch: string) =>
  git(root, "config", "--get", `branch.${branch}.specty`);

describe("the branch of a new change", () => {
  it("is its type and title in GitHub Flow, and the change keeps its dated id (AC1, AC6)", async () => {
    const root = await repo("github");
    const created = await cli(root, ["new", "Login con Google", "--type", "fix"]);
    expect(created.code).toBe(0);
    const folder = folderOf(root, LOGIN);
    expect(created.out).toContain(
      `Cambio creado: ${LOGIN} (rama fix/login-con-google) en ${folder}`,
    );
    expect(git(folder, "branch", "--show-current")).toBe("fix/login-con-google");
    expect(await stateIn(folder, LOGIN)).toMatchObject({
      id: LOGIN,
      branch: "fix/login-con-google",
    });
    expect(await read(folder, `.specty/changes/${LOGIN}/audit.jsonl`)).toContain('"type":"fix"');
    expect(markOf(root, "fix/login-con-google")).toBe(LOGIN);
    // Without --type, a feature.
    expect((await cli(root, ["new", "Exportar CSV"])).code).toBe(0);
    expect(git(folderOf(root, idOf("exportar-csv")), "branch", "--show-current")).toBe(
      "feat/exportar-csv",
    );
  });

  it("uses Git Flow's prefixes, and spike/ for a spike (AC2)", async () => {
    const root = await repo("gitflow");
    await cli(root, ["new", "Login con Google", "--type", "fix"]);
    await cli(root, ["new", "Exportar CSV", "--type", "refactor"]);
    await cli(root, ["new", "Probar la caché", "--kind", "spike", "--timebox", "2h"]);
    const branchOf = (slug: string) => git(folderOf(root, idOf(slug)), "branch", "--show-current");
    expect(branchOf("login-con-google")).toBe("bugfix/login-con-google");
    expect(branchOf("exportar-csv")).toBe("feature/exportar-csv");
    expect(branchOf("probar-la-cache")).toBe("spike/probar-la-cache");
  });

  it("keeps Specty's own name without git.flow, marked also in this folder (AC3, AC6)", async () => {
    const root = await tempRepo(APP);
    const created = await cli(root, ["new", "Saludo personalizado", "--type", "fix"]);
    expect(created.code).toBe(0);
    expect(git(root, "branch", "--show-current")).toBe(`specty/${CHANGE}`);
    expect(markOf(root, `specty/${CHANGE}`)).toBe(CHANGE);
  });

  it("takes the first free name when the branch exists here or in a remote (AC4)", async () => {
    const root = await repo("trunk");
    git(root, "branch", "fix/login-con-google");
    git(root, "update-ref", "refs/remotes/origin/fix/login-con-google-2", "HEAD");
    expect((await cli(root, ["new", "Login con Google", "--type", "fix"])).code).toBe(0);
    const folder = folderOf(root, LOGIN);
    expect(git(folder, "branch", "--show-current")).toBe("fix/login-con-google-3");
    expect(await stateIn(folder, LOGIN)).toMatchObject({ branch: "fix/login-con-google-3" });
  });

  it("is not made for an unknown type, which names the valid ones (AC5)", async () => {
    const root = await repo("github");
    const refused = await cli(root, ["new", "Login con Google", "--type", "bug"]);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("Tipo de commit desconocido: bug.");
    expect(refused.out).toContain("--type feat|fix|refactor|perf|test|docs|chore|build|ci|style");
    expect(await exists(folderOf(root, LOGIN))).toBe(false);
    expect(git(root, "branch", "--list", "bug/*")).toBe("");
  });
});
