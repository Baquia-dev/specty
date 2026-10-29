// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { APP, CHANGE, cli, folderOf, git, read, stateIn, tempRepo } from "./support";

/** A configuration whose changes go in worktrees, with branches named as `flow` (or `pattern`) says. */
const configOf = (flow: string, pattern?: string) =>
  `version: 1\nlanguage: es\ngit:\n  flow: ${flow}\n${pattern === undefined ? "" : `  branchPattern: ${JSON.stringify(pattern)}\n`}verify:\n  default: "true"\n`;
const repo = (flow: string, pattern?: string) =>
  tempRepo({ ...APP, ".specty/config.yaml": configOf(flow, pattern) });
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

describe("the change of a semantic branch", () => {
  it("is the active one in its folder, a spike's too (AC7)", async () => {
    const root = await repo("gitflow");
    await cli(root, ["new", "Login con Google", "--type", "fix"]);
    await cli(root, ["new", "Probar la caché", "--kind", "spike", "--timebox", "2h"]);
    expect((await cli(folderOf(root, LOGIN), ["next"])).out).toContain(`SPECTY · ${LOGIN} · draft`);
    // spike/<slug> does not name an id, as Specty's own spike/<id> does.
    const spike = idOf("probar-la-cache");
    expect((await cli(folderOf(root, spike), ["next"])).out).toContain(`SPECTY · ${spike} · draft`);
  });

  it("is found by its state when the branch came without the mark, as from another clone (AC7)", async () => {
    const root = await repo("github");
    await cli(root, ["new", "Login con Google", "--type", "fix"]);
    git(root, "config", "--unset", "branch.fix/login-con-google.specty");
    const next = await cli(folderOf(root, LOGIN), ["next"]);
    expect(next.out).toContain(`SPECTY · ${LOGIN} · draft`);
  });
});

describe("next before a change", () => {
  it("asks for --type when the flow names the branches by it, and not otherwise (AC1)", async () => {
    for (const flow of ["github", "trunk", "gitflow"]) {
      const next = await cli(await repo(flow), ["next"]);
      expect(next.out, flow).toContain('`specty new "<título>" --type <tipo> --request');
    }
    for (const config of [APP[".specty/config.yaml"], configOf("specty")]) {
      const next = await cli(await tempRepo({ ...APP, ".specty/config.yaml": config }), ["next"]);
      expect(next.out).toContain('`specty new "<título>" --request');
      expect(next.out).not.toContain("--type");
    }
  });
});

describe("a branch pattern", () => {
  it("names the branch over the flow, and next asks for --type only if it has {type} (AC1, AC3)", async () => {
    const root = await repo("gitflow", "team/{type}-{slug}");
    expect((await cli(root, ["next"])).out).toContain("--type <tipo>");
    expect((await cli(root, ["new", "Login con Google", "--type", "fix"])).code).toBe(0);
    expect(git(folderOf(root, LOGIN), "branch", "--show-current")).toBe(
      "team/fix-login-con-google",
    );
    const untyped = await cli(await repo("github", "users/ana/{slug}"), ["next"]);
    expect(untyped.out).not.toContain("--type");
  });

  it("stops every command when it gives no valid branches, and says why (AC2)", async () => {
    const root = await repo("github", "{type}/fijo");
    const next = await cli(root, ["next"]);
    expect(next.code).toBe(1);
    expect(next.out).toContain("git.branchPattern: The pattern needs {slug} or {id}");
    expect(next.out).toContain("corrige .specty/config.yaml");
  });
});

describe("custom slug and branch in new", () => {
  it("uses --slug to name the change id and branch cleanly", async () => {
    const root = await tempRepo(APP);
    const created = await cli(root, [
      "new",
      "La spec del cambio se ve en el chat al proponerla",
      "--slug",
      "spec-en-chat",
    ]);
    expect(created.code).toBe(0);
    const expectedId = `${CHANGE.slice(0, 8)}-spec-en-chat`;
    expect(git(root, "branch", "--show-current")).toBe(`specty/${expectedId}`);
    expect(markOf(root, `specty/${expectedId}`)).toBe(expectedId);
  });

  it("uses --branch to override the branch name completely", async () => {
    const root = await repo("github");
    const created = await cli(root, [
      "new",
      "Un título descriptivo largo",
      "--branch",
      "custom/mi-rama",
    ]);
    expect(created.code).toBe(0);
    const id = idOf("un-titulo-descriptivo-largo");
    const folder = folderOf(root, id);
    expect(git(folder, "branch", "--show-current")).toBe("custom/mi-rama");
    expect(markOf(root, "custom/mi-rama")).toBe(id);
  });
});
