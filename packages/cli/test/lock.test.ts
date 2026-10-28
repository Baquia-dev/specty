// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Output } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { withChangeLock } from "../src/flow/active";
import { openSession, type Session } from "../src/session";
import { AGENT, APP, CHANGE, cli, DIST, git, NOW, tempRepo, testEnv } from "./support";

const DONE: Output = { status: "ok", header: "SPECTY", blocks: [], next: "nada" };

/** A repository with SPEC's change in draft, and a session in its folder. */
async function withChange(): Promise<{ root: string; session: Session }> {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  return { root, session: await sessionIn(root) };
}

/** A session in `root`, as the local server opens one. */
async function sessionIn(root: string): Promise<Session> {
  const opened = await openSession({
    cwd: root,
    env: testEnv(),
    now: () => NOW,
    terminal: AGENT,
    io: { out: () => undefined, err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
  });
  if (opened.kind !== "ok") throw new Error("no Specty session");
  return opened.session;
}

/** Where the lock of the change of `root` lives, shared by every worktree. */
const lockPath = (root: string) =>
  join(root, git(root, "rev-parse", "--git-path", `common/specty/locks/${CHANGE}.json`));

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** A lock as another process `pid` left it. */
async function lockedBy(root: string, pid: number): Promise<void> {
  const path = lockPath(root);
  await mkdir(dirname(path), { recursive: true });
  const holder = { pid, command: "accept", folder: root, at: "2026-10-28T04:38:48.160Z" };
  await writeFile(path, JSON.stringify(holder));
}

/** A process that ran and is gone. */
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;

describe("the lock of a change", () => {
  it("AC3: holds the change while the command runs and lets it go after an output or an error", async () => {
    const { root, session } = await withChange();
    const output = await withChangeLock(session, "propose", async () => {
      const holder = JSON.parse(await readFile(lockPath(root), "utf8"));
      expect(holder).toMatchObject({ pid: process.pid, command: "propose", folder: root });
      return DONE;
    });
    expect(output).toBe(DONE);
    expect(await exists(lockPath(root))).toBe(false);
    const failing = withChangeLock(session, "propose", () => Promise.reject(new Error("roto")));
    await expect(failing).rejects.toThrow("roto");
    expect(await exists(lockPath(root))).toBe(false);
  });

  it("AC1: refuses while another live process holds it, without running the command", async () => {
    const { root, session } = await withChange();
    await lockedBy(root, process.ppid);
    let ran = false;
    const output = await withChangeLock(session, "propose", async () => {
      ran = true;
      return DONE;
    });
    expect(ran).toBe(false);
    expect(output.status).toBe("blocked");
    expect(output.blocks.flatMap((block) => block.lines).join("\n")).toContain(
      `\`specty accept\` (pid ${process.ppid}, desde 2026-10-28 04:38:48 UTC, en esta carpeta)`,
    );
    // Still the other process's.
    expect(JSON.parse(await readFile(lockPath(root), "utf8")).pid).toBe(process.ppid);
  });

  it("AC2: takes a lock whose process no longer exists", async () => {
    const { root, session } = await withChange();
    await lockedBy(root, deadPid());
    expect(await withChangeLock(session, "propose", async () => DONE)).toBe(DONE);
    expect(await exists(lockPath(root))).toBe(false);
  });

  it("is taken once within a process, and runs as is without a change", async () => {
    const { root, session } = await withChange();
    const nested = await withChangeLock(session, "close", () =>
      withChangeLock(session, "close", async () => DONE),
    );
    expect(nested).toBe(DONE);
    expect(await exists(lockPath(root))).toBe(false);
    const bare = await sessionIn(await tempRepo(APP));
    expect(await withChangeLock(bare, "next", async () => DONE)).toBe(DONE);
  });
});
