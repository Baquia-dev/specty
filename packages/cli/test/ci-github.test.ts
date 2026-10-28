// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, git, tempRepo, writeFiles } from "./support";

/** A commit of governed code without trailers: `specty ci` fails `traced` only if it reads it. */
async function untracedCommit(root: string, subject: string, path: string): Promise<string> {
  await writeFiles(root, { [path]: "x\n" });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", subject);
  return git(root, "rev-parse", "HEAD");
}

/**
 * A repository whose `origin` is itself, on a branch `spike/prueba` with two untraced commits.
 * `origin/trunk` stops at the first, so only a range from there leaves it out.
 */
async function withOrigin() {
  const root = await tempRepo(APP);
  git(root, "remote", "add", "origin", root);
  git(root, "switch", "-q", "-c", "spike/prueba");
  const first = await untracedCommit(root, "fix: primero", "src/uno.ts");
  git(root, "branch", "trunk");
  const second = await untracedCommit(root, "fix: sin spec", "src/extra.ts");
  git(root, "fetch", "-q", "origin");
  // As in a clone from GitHub; a fetch could point it at this repository's own branch.
  git(root, "remote", "set-head", "origin", "main");
  return { root, first, second: second.slice(0, 7) };
}

const PULL_REQUEST = {
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "pull_request",
  GITHUB_BASE_REF: "main",
  GITHUB_HEAD_REF: "spike/prueba",
};

/** A push event of `before`, with its payload in a file as GitHub Actions leaves it. */
async function push(root: string, before: string) {
  // Inside `.git`, so it is no file of the repository.
  await writeFiles(root, {
    ".git/event.json": JSON.stringify({ before, repository: { default_branch: "trunk" } }),
  });
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF_NAME: "feature",
    GITHUB_EVENT_PATH: `${root}/.git/event.json`,
  };
}

const untraced = (sha: string) =>
  `${sha} «fix: sin spec» no lleva Specty-Change (documéntalo con specty retro): src/extra.ts`;
const FIRST = "«fix: primero»";
const SPIKE = "la rama spike/prueba es de un spike, que no va a la rama destino";

describe("specty ci in GitHub Actions", () => {
  it("AC1: checks a pull request's commits, into its base, from its branch", async () => {
    const { root, second } = await withOrigin();
    const intoMain = await cli(root, ["ci"], { env: PULL_REQUEST });
    expect(intoMain.code).toBe(1);
    expect(intoMain.out).toContain(untraced(second));
    expect(intoMain.out).toContain(FIRST);
    expect(intoMain.out).toContain(SPIKE);
    const intoTrunk = await cli(root, ["ci"], {
      env: { ...PULL_REQUEST, GITHUB_BASE_REF: "trunk" },
    });
    expect(intoTrunk.out).toContain(untraced(second));
    expect(intoTrunk.out).not.toContain(FIRST);
    expect(intoTrunk.out).not.toContain(SPIKE);
  });

  it("AC2: checks a push's commits from the one before, or from the default branch", async () => {
    const { root, first, second } = await withOrigin();
    const pushed = await cli(root, ["ci"], { env: await push(root, first) });
    expect(pushed.code).toBe(1);
    expect(pushed.out).toContain(untraced(second));
    expect(pushed.out).not.toContain(FIRST);
    const created = await cli(root, ["ci"], { env: await push(root, "0".repeat(40)) });
    expect(created.code).toBe(1);
    expect(created.out).toContain(untraced(second));
    expect(created.out).not.toContain(FIRST);
  });

  it("AC2: lets the options on the command line win over the event", async () => {
    const { root, second } = await withOrigin();
    const base = await cli(root, ["ci", "--base", "HEAD"], { env: PULL_REQUEST });
    expect(base.code, base.out).toBe(0);
    const branch = await cli(root, ["ci", "--head-ref", "feature/saludo"], { env: PULL_REQUEST });
    expect(branch.out).toContain(untraced(second));
    expect(branch.out).not.toContain(SPIKE);
    const outside = await cli(root, ["ci"], { env: { ...PULL_REQUEST, GITHUB_ACTIONS: "false" } });
    expect(outside.out).not.toContain(SPIKE);
  });
});
