// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sessionAt } from "../../test/server/support";
import { AGENT, APP, CONFIG, tempRepo } from "../../test/support";
import { exists, isRecord, parseJson } from "../io/files";
import { landingTurn, oneAtATime } from "./full-verification";

const LOCKS = ".git/common/specty/locks";
const LOCK = `${LOCKS}/full-verification.json`;

/** A session of `root` whose error output is kept. */
async function watched(root: string) {
  const errors: string[] = [];
  const session = await sessionAt(root, AGENT);
  const io = { ...session.environment.io, err: (text: string) => void errors.push(text) };
  return { errors, session: { ...session, environment: { ...session.environment, io } } };
}

/** Another session's full verification, by process `pid`, as its turn says. */
async function heldBy(root: string, pid: number): Promise<void> {
  await mkdir(join(root, LOCKS), { recursive: true });
  const holder = {
    pid,
    command: "pnpm check",
    folder: "/otra/carpeta",
    at: "2026-11-03T14:05:00.000Z",
  };
  await writeFile(join(root, LOCK), JSON.stringify(holder));
}

/** A process that lives `ms` milliseconds, and when it ends. */
function living(ms: number) {
  const child = spawn(process.execPath, ["-e", `setTimeout(() => {}, ${ms})`]);
  const ended = new Promise<void>((done) => child.on("exit", () => done()));
  return { pid: child.pid ?? 0, ended };
}

describe("one full verification at a time", () => {
  it("AC1: waits while another live session verifies, says once who it is, then runs", async () => {
    const root = await tempRepo(APP);
    const { session, errors } = await watched(root);
    const other = living(1500);
    await heldBy(root, other.pid);
    const started = Date.now();
    let ran = 0;
    const result = await oneAtATime(
      session,
      "pnpm check",
      async () => {
        ran = Date.now();
        return "hecho";
      },
      { pollMs: 50 },
    );
    await other.ended;
    expect(result).toBe("hecho");
    expect(ran - started).toBeGreaterThanOrEqual(1000);
    const waiting = errors.filter((text) =>
      text.includes("otra sesión está haciendo una verificación completa"),
    );
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toContain("(`pnpm check` en /otra/carpeta, desde las 14:05 UTC)");
    expect(await exists(join(root, LOCK))).toBe(false);
  });

  it("AC2: runs at once with nobody verifying or a holder gone, and frees the turn after a failure", async () => {
    const root = await tempRepo(APP);
    const { session, errors } = await watched(root);
    const started = Date.now();
    expect(await oneAtATime(session, "pnpm check", async () => 1, { pollMs: 50 })).toBe(1);
    expect(await exists(join(root, LOCK))).toBe(false);
    const gone = living(0);
    await gone.ended;
    await heldBy(root, gone.pid);
    const failing = oneAtATime(
      session,
      "pnpm check",
      async () => {
        throw new Error("falló");
      },
      { pollMs: 50 },
    );
    await expect(failing).rejects.toThrow("falló");
    expect(await exists(join(root, LOCK))).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(errors.join("\n")).not.toContain("otra sesión");
  });
});

const QUEUE = `${LOCKS}/full-verification.queue`;

/** Another session that waits in the turn's queue since before anyone else, by process `pid`. */
async function queuedFirst(root: string, pid: number): Promise<void> {
  await mkdir(join(root, QUEUE), { recursive: true });
  const holder = {
    pid,
    command: "pnpm check",
    folder: "/la/primera",
    at: "2026-11-03T14:04:00.000Z",
  };
  await writeFile(join(root, QUEUE, `000000000000001-${pid}.json`), JSON.stringify(holder));
}

/** When the process ends, in milliseconds since the epoch. */
const endOf = (process: ReturnType<typeof living>) => process.ended.then(() => Date.now());

describe("the queue of the full verification's turn", () => {
  it("AC1: keeps waiting past verify.timeoutSec while the holder lives, and runs only once the turn is free", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}  timeoutSec: 1\n` });
    const { session } = await watched(root);
    const other = living(2500);
    const otherEnd = endOf(other);
    await heldBy(root, other.pid);
    let ran = 0;
    await oneAtATime(
      session,
      "pnpm check",
      async () => {
        ran = Date.now();
      },
      { pollMs: 50 },
    );
    expect(ran).toBeGreaterThanOrEqual(await otherEnd);
    expect(await exists(join(root, LOCK))).toBe(false);
  });

  it("AC2: lets a live session that queued first take the turn first, and says how many wait ahead", async () => {
    const root = await tempRepo(APP);
    const { session, errors } = await watched(root);
    const holder = living(800);
    const first = living(2500);
    const firstEnd = endOf(first);
    await heldBy(root, holder.pid);
    await queuedFirst(root, first.pid);
    let ran = 0;
    await oneAtATime(
      session,
      "pnpm check",
      async () => {
        ran = Date.now();
      },
      { pollMs: 50 },
    );
    expect(ran).toBeGreaterThanOrEqual(await firstEnd);
    const waiting = errors.filter((text) => text.includes("otra sesión está haciendo"));
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toContain("Delante en la cola: 1.");
    expect(await readdir(join(root, QUEUE))).toEqual([]);
    expect(await exists(join(root, LOCK))).toBe(false);
  });
});

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** The command of whoever holds the turn in `root` now, if anyone does. */
async function turnHolder(root: string): Promise<unknown> {
  const holder = parseJson(await readFile(join(root, LOCK), "utf8").catch(() => undefined));
  return isRecord(holder) ? holder.command : undefined;
}

/** Waits, in real time, until someone holds the turn in `root`. */
async function untilHeld(root: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!(await exists(join(root, LOCK)))) {
    if (Date.now() > deadline) throw new Error("timed out");
    await pause(20);
  }
}

describe("the turn within one process", () => {
  it("AC1: another part of the same process waits for the turn, says who has it, and holds it while it runs", async () => {
    const root = await tempRepo(APP);
    const first = await watched(root);
    const second = await watched(root);
    let firstEnded = 0;
    let secondStarted = 0;
    let holderInside: unknown;
    // The UI's server verifying a change...
    const verifying = oneAtATime(
      first.session,
      "pnpm check",
      async () => {
        await pause(800);
        firstEnded = Date.now();
      },
      { pollMs: 50 },
    );
    await untilHeld(root);
    // ...while the person accepts another one, in the same process.
    const accepting = oneAtATime(
      second.session,
      "pnpm test",
      async () => {
        secondStarted = Date.now();
        holderInside = await turnHolder(root);
      },
      { pollMs: 50 },
    );
    await Promise.all([verifying, accepting]);
    expect(secondStarted).toBeGreaterThanOrEqual(firstEnded);
    const waiting = second.errors.filter((text) =>
      text.includes("otra sesión está haciendo una verificación completa"),
    );
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toContain("`pnpm check`");
    expect(holderInside).toBe("pnpm test");
    expect(await exists(join(root, LOCK))).toBe(false);
  });

  it("AC2: a closing's landing in the same process waits for the turn another part holds", async () => {
    const root = await tempRepo({
      ...APP,
      ".specty/config.yaml": `${CONFIG()}  full: "pnpm check"\n`,
    });
    const first = await watched(root);
    const second = await watched(root);
    const plan = {
      id: "cambio",
      target: "main",
      branch: "specty/cambio",
      holder: root,
      main: root,
      inMain: false,
    };
    let firstEnded = 0;
    let landed = 0;
    const verifying = oneAtATime(
      first.session,
      "pnpm check",
      async () => {
        await pause(800);
        firstEnded = Date.now();
      },
      { pollMs: 50 },
    );
    await untilHeld(root);
    await landingTurn(second.session, plan, async () => {
      landed = Date.now();
    });
    await verifying;
    expect(landed).toBeGreaterThanOrEqual(firstEnded);
  });

  it("AC3: what runs inside the turn of a closing has it too, and does not wait for it", async () => {
    const root = await tempRepo({
      ...APP,
      ".specty/config.yaml": `${CONFIG()}  full: "pnpm check"\n`,
    });
    const { session, errors } = await watched(root);
    const plan = {
      id: "cambio",
      target: "main",
      branch: "specty/cambio",
      holder: root,
      main: root,
      inMain: false,
    };
    const started = Date.now();
    const holders = await landingTurn(session, plan, async () => {
      const outer = await turnHolder(root);
      const inner = await oneAtATime(session, "pnpm check", () => turnHolder(root), {
        pollMs: 50,
      });
      return [outer, inner];
    });
    expect(holders).toEqual(["pnpm check", "pnpm check"]);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(errors.join("\n")).not.toContain("otra sesión");
    expect(await exists(join(root, LOCK))).toBe(false);
  });
});
