// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lockWaits, markBranch } from "../src/flow/branches";
import type { ExecResult } from "../src/io/exec";
import { exists } from "../src/io/files";
import { GitError } from "../src/io/git";
import { CHANGE, CONFIG, cli, git, tempRepo } from "./support";

const FILES = {
  "src/app.ts": "export const greet = () => 'hola';\n",
  ".specty/config.yaml": CONFIG(),
};
const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
const BRANCH = `specty/${OTHER}`;
const LOCKED: ExecResult = {
  code: 255,
  stdout: "",
  stderr: "error: could not lock config file .git/config: File exists\n",
  timedOut: false,
};
const WRITTEN: ExecResult = { code: 0, stdout: "", stderr: "", timedOut: false };

/** A git whose `run` answers with `results` in order and keeps the arguments of each call. */
function scripted(results: readonly ExecResult[]) {
  const calls: (readonly string[])[] = [];
  const run = async (args: readonly string[]): Promise<ExecResult> => {
    calls.push(args);
    return results[calls.length - 1] ?? WRITTEN;
  };
  return { calls, run };
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

describe("markBranch while another process holds git's configuration", () => {
  it("AC3: tries the write again until it works", async () => {
    const git = scripted([LOCKED, LOCKED, WRITTEN]);
    await markBranch(git, BRANCH, OTHER, [0, 0, 0]);
    expect(git.calls).toHaveLength(3);
    expect(git.calls[2]).toEqual(["config", `branch.${BRANCH}.specty`, OTHER]);
  });

  it("AC3: after its last try, throws git's error", async () => {
    const git = scripted([LOCKED, LOCKED, LOCKED, WRITTEN]);
    const marked = markBranch(git, BRANCH, OTHER, [0, 0]);
    await expect(marked).rejects.toBeInstanceOf(GitError);
    await expect(marked).rejects.toThrow("could not lock config file");
    expect(git.calls).toHaveLength(3);
  });
});

describe("specty new while another process holds git's configuration", () => {
  it("AC1: tries again and creates the change once the other process lets go", async () => {
    const root = await tempRepo(FILES);
    const lock = join(root, ".git", "config.lock");
    await writeFile(lock, "");
    const folder = join(root, ".worktrees", OTHER);
    let finished = false;
    // The other process lets go of it a moment after the folder appears, while `new` tries again.
    const freed = (async () => {
      while (!finished && !(await exists(folder))) await pause(10);
      await pause(100);
      await rm(lock, { force: true });
    })();
    const created = await cli(root, ["new", "--worktree", "Otro cambio"]);
    finished = true;
    await freed;
    expect(created.code).toBe(0);
    expect(created.out).toContain(`Cambio creado: ${OTHER} (rama ${BRANCH}) en ${folder}`);
    expect(git(root, "config", `branch.${BRANCH}.specty`)).toBe(OTHER);
    expect(git(folder, "branch", "--show-current")).toBe(BRANCH);
  });

  it("AC2: if it still cannot, leaves neither the folder nor the branch, and runs again with the same id", async () => {
    const root = await tempRepo(FILES);
    const lock = join(root, ".git", "config.lock");
    await writeFile(lock, "");
    const folder = join(root, ".worktrees", OTHER);
    const failed = await cli(root, ["new", "--worktree", "Otro cambio"]);
    expect(failed.code).toBe(1);
    expect(failed.out).toContain("Git falló y Specty no terminó el comando: git config:");
    expect(failed.out).toContain(
      `Specty deshizo lo que había creado: la carpeta ${folder} y la rama ${BRANCH}.`,
    );
    expect(failed.out).toContain("SIGUIENTE: corrige lo que hizo fallar a git");
    expect(await exists(folder)).toBe(false);
    expect(git(root, "branch", "--list", BRANCH)).toBe("");
    expect(git(root, "worktree", "list", "--porcelain")).not.toContain(folder);

    await rm(lock);
    const again = await cli(root, ["new", "--worktree", "Otro cambio"]);
    expect(again.code).toBe(0);
    expect(again.out).toContain(`Cambio creado: ${OTHER} (rama ${BRANCH}) en ${folder}`);
    expect(git(root, "config", `branch.${BRANCH}.specty`)).toBe(OTHER);
  });
});

describe("specty new and internal.retries.gitConfig", () => {
  /**
   * The writes of the branch's mark that `specty new --worktree` tried in a repository whose
   * `config.yaml` ends with `extra`, while another process holds git's configuration the whole
   * time, counted in a `GIT_TRACE` file; and that it undid what it had created.
   */
  const triedWrites = async (extra: string) => {
    const root = await tempRepo({ ...FILES, ".specty/config.yaml": `${CONFIG()}${extra}` });
    await writeFile(join(root, ".git", "config.lock"), "");
    const trace = join(await mkdtemp(join(tmpdir(), "specty-trace-")), "git.log");
    const failed = await cli(root, ["new", "--worktree", "Otro cambio"], {
      env: { GIT_TRACE: trace },
    });
    expect(failed.code).toBe(1);
    expect(failed.out).toContain("Specty deshizo lo que había creado");
    expect(await exists(join(root, ".worktrees", OTHER))).toBe(false);
    const written = `trace: built-in: git config branch.${BRANCH}.specty ${OTHER}`;
    return (await readFile(trace, "utf8")).split("\n").filter((line) => line.includes(written));
  };

  it("AC2: repeats the write that ties the branch to its change those more times, then undoes", async () => {
    expect(await triedWrites("internal:\n  retries:\n    gitConfig: 1\n")).toHaveLength(2);
    expect(await triedWrites("internal:\n  retries:\n    gitConfig: 3\n")).toHaveLength(4);
  });

  it("AC2: without the key, repeats it 5 times, as before", async () => {
    expect(await triedWrites("")).toHaveLength(6);
  });

  it("AC2: waits twice the wait before each time, from 50 ms", async () => {
    expect(lockWaits(1)).toEqual([50]);
    expect(lockWaits(5)).toEqual([50, 100, 200, 400, 800]);
    expect(lockWaits(10).at(-1)).toBe(25_600);
  });
});
