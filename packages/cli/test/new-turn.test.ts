// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { onNewTurn } from "../src/flow/new-turn";
import { openSession, type Session } from "../src/session";
import { AGENT, APP, DIST, git, NOW, tempRepo, testEnv } from "./support";

/** A repository and a session in its folder, as `new` opens one. */
async function repoSession(): Promise<{ root: string; session: Session }> {
  const root = await tempRepo(APP);
  const opened = await openSession({
    cwd: root,
    env: testEnv(),
    now: () => NOW,
    terminal: AGENT,
    io: { out: () => undefined, err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
  });
  if (opened.kind !== "ok") throw new Error("no Specty session");
  return { root, session: opened.session };
}

/** Where the turn of `new` lives in `root`'s clone, shared by every worktree. */
const turnPath = (root: string) =>
  join(root, git(root, "rev-parse", "--git-path", "common/specty/locks/new.json"));

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** The turn of `new` as process `pid` holds it. */
async function heldBy(root: string, pid: number): Promise<void> {
  const path = turnPath(root);
  await mkdir(dirname(path), { recursive: true });
  const holder = { pid, command: "new", folder: root, at: NOW.toISOString() };
  await writeFile(path, `${JSON.stringify(holder, null, 2)}\n`);
}

/** The pid of a process that has already ended. */
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;

/** Short waits, so a test never waits for long: about one second in all. */
const WAITS: readonly number[] = Array.from({ length: 200 }, () => 5);

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A step that tells in `events` when it starts and when it ends, and gives its name. */
function step(name: string, events: string[]): () => Promise<string> {
  return async () => {
    events.push(`${name} starts`);
    await pause(40);
    events.push(`${name} ends`);
    return name;
  };
}

/** Off Windows, two at once overlap, and a turn another process holds keeps nobody waiting. */
async function noTurn(platform: NodeJS.Platform): Promise<void> {
  const { root, session } = await repoSession();
  const events: string[] = [];
  await Promise.all([
    onNewTurn(session, step("A", events), platform, WAITS),
    onNewTurn(session, step("B", events), platform, WAITS),
  ]);
  expect(events.map((event) => event.split(" ")[1])).toEqual(["starts", "starts", "ends", "ends"]);
  expect(await exists(turnPath(root))).toBe(false);
  await heldBy(root, process.ppid);
  const started = Date.now();
  expect(await onNewTurn(session, async () => "ran", platform, [60_000])).toBe("ran");
  expect(Date.now() - started).toBeLessThan(5_000);
}

describe("the turn of `new`", () => {
  it("AC1: on Windows, two at once run one after the other, and the turn goes when each ends", async () => {
    const { root, session } = await repoSession();
    const events: string[] = [];
    const ran = await Promise.all([
      onNewTurn(session, step("A", events), "win32", WAITS),
      onNewTurn(session, step("B", events), "win32", WAITS),
    ]);
    expect(ran).toEqual(["A", "B"]);
    expect(events.map((event) => event.split(" ")[1])).toEqual([
      "starts",
      "ends",
      "starts",
      "ends",
    ]);
    expect(events[0]?.split(" ")[0]).toBe(events[1]?.split(" ")[0]);
    expect(await exists(turnPath(root))).toBe(false);
  });

  it("AC1: on Windows, holds the turn while it runs and lets it go after a failure too", async () => {
    const { root, session } = await repoSession();
    const holder = onNewTurn(
      session,
      async () => {
        const held: unknown = JSON.parse(await readFile(turnPath(root), "utf8"));
        expect(held).toMatchObject({ pid: process.pid, command: "new" });
        throw new Error("git failed");
      },
      "win32",
      WAITS,
    );
    await expect(holder).rejects.toThrow("git failed");
    expect(await exists(turnPath(root))).toBe(false);
  });

  it("AC2: on Windows, runs without the turn once its waits run out while another live process holds it", async () => {
    const { root, session } = await repoSession();
    await heldBy(root, process.ppid);
    const ran = await onNewTurn(session, async () => "ran", "win32", [1, 1]);
    expect(ran).toBe("ran");
    // The turn stays the other process's.
    const held: unknown = JSON.parse(await readFile(turnPath(root), "utf8"));
    expect(held).toMatchObject({ pid: process.ppid });
  });

  it("AC2: on Windows, takes at once the turn a process that no longer exists left", async () => {
    const { root, session } = await repoSession();
    await heldBy(root, deadPid());
    const holder = await onNewTurn(
      session,
      async (): Promise<unknown> => JSON.parse(await readFile(turnPath(root), "utf8")),
      "win32",
      [],
    );
    expect(holder).toMatchObject({ pid: process.pid, command: "new" });
    expect(await exists(turnPath(root))).toBe(false);
  });

  it("AC3: on Linux, takes no turn and does not wait, though another process holds it", async () => {
    await noTurn("linux");
  });

  it("AC3: on macOS, takes no turn and does not wait, though another process holds it", async () => {
    await noTurn("darwin");
  });
});
