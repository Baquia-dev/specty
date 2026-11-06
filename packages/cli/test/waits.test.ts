// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openSession } from "../src/session";
import { markWait, readWait } from "../src/store/waits";
import { AGENT, APP, CHANGE, DIST, git, NOW, tempRepo, testEnv } from "./support";

/** The git of a fresh repository's folder, as a command opens it. */
async function gitIn(root: string) {
  const opened = await openSession({
    cwd: root,
    env: testEnv(),
    now: () => NOW,
    terminal: AGENT,
    io: { out: () => undefined, err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
  });
  if (opened.kind !== "ok") throw new Error("no Specty session");
  return opened.session.git;
}

/** Where the mark of change `id` of `root` lives, shared by every worktree. */
const markPath = (root: string, id = CHANGE) =>
  join(root, git(root, "rev-parse", "--git-path", `common/specty/waits/${id}.json`));

const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;

const holder = (pid: number, intervalMs = 500) => ({
  pid,
  tool: "claude-code" as const,
  since: new Date().toISOString(),
  intervalMs,
  timeoutSec: 3600,
});

/** When the mark's file was last renewed. */
const renewedAt = async (root: string) => (await stat(markPath(root))).mtime;

describe("the mark of `specty wait`", () => {
  it("AC2: there is nothing to read when no `wait` left a mark", async () => {
    const root = await tempRepo(APP);
    expect(await readWait(await gitIn(root), CHANGE, new Date())).toBeUndefined();
  });

  it("AC1: a `wait` that waits leaves a live mark in the clone's common folder", async () => {
    const root = await tempRepo(APP);
    const repo = await gitIn(root);
    const waiting = holder(process.pid);
    await markWait(repo, CHANGE, waiting);
    expect(JSON.parse(await readFile(markPath(root), "utf8"))).toEqual(waiting);
    expect(await readWait(repo, CHANGE, new Date())).toEqual(waiting);
  });

  it("AC1: renewing the mark moves its file's time", async () => {
    const root = await tempRepo(APP);
    const mark = await markWait(await gitIn(root), CHANGE, holder(process.pid));
    const before = await renewedAt(root);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await mark.renew();
    expect((await renewedAt(root)).getTime()).toBeGreaterThan(before.getTime());
  });

  it("AC2: an ended mark says when and why it ended", async () => {
    const root = await tempRepo(APP);
    const repo = await gitIn(root);
    const waiting = holder(process.pid);
    const mark = await markWait(repo, CHANGE, waiting);
    const before = Date.now();
    await mark.end("decided");
    const seen = await readWait(repo, CHANGE, new Date());
    expect(seen).toMatchObject({ ...waiting, ended: { reason: "decided" } });
    expect(Date.parse(seen?.ended?.at ?? "")).toBeGreaterThanOrEqual(before - 1000);

    const again = await markWait(repo, CHANGE, holder(process.pid));
    await again.end("timeout");
    expect((await readWait(repo, CHANGE, new Date()))?.ended?.reason).toBe("timeout");
  });

  it("AC2: a mark without `ended` whose process no longer exists was cut off when its file was last renewed", async () => {
    const root = await tempRepo(APP);
    const repo = await gitIn(root);
    await markWait(repo, CHANGE, holder(deadPid()));
    const renewed = await renewedAt(root);
    expect((await readWait(repo, CHANGE, new Date()))?.ended).toEqual({
      at: renewed.toISOString(),
      reason: "stopped",
    });
  });

  it("AC2: a mark not renewed for more than 30 s, or three of its intervals, was cut off", async () => {
    const root = await tempRepo(APP);
    const repo = await gitIn(root);
    await markWait(repo, CHANGE, holder(process.pid, 100));
    const renewed = (await renewedAt(root)).getTime();
    expect((await readWait(repo, CHANGE, new Date(renewed + 29_000)))?.ended).toBeUndefined();
    expect((await readWait(repo, CHANGE, new Date(renewed + 31_000)))?.ended).toEqual({
      at: new Date(renewed).toISOString(),
      reason: "stopped",
    });

    await markWait(repo, CHANGE, holder(process.pid, 20_000));
    const slow = (await renewedAt(root)).getTime();
    expect((await readWait(repo, CHANGE, new Date(slow + 59_000)))?.ended).toBeUndefined();
    expect((await readWait(repo, CHANGE, new Date(slow + 61_000)))?.ended?.reason).toBe("stopped");
  });

  it("AC1, AC2: the last `wait` that wrote counts, and an earlier one does not end its mark", async () => {
    const root = await tempRepo(APP);
    const repo = await gitIn(root);
    const first = await markWait(repo, CHANGE, {
      ...holder(process.pid),
      since: "2026-11-06T10:00:00.000Z",
    });
    const last = {
      ...holder(process.pid),
      tool: "codex" as const,
      since: "2026-11-06T10:05:00.000Z",
    };
    await markWait(repo, CHANGE, last);
    await first.end("timeout");
    expect(await readWait(repo, CHANGE, new Date())).toEqual(last);
  });
});
