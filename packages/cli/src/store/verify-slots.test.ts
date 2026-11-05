// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sessionAt } from "../../test/server/support";
import { AGENT, APP, tempRepo } from "../../test/support";
import { inSlots } from "./verify-slots";

const RUNNING = ".git/common/specty/locks/verify-slots";

/** A session of `root` whose error output is kept. */
async function watched(root: string) {
  const errors: string[] = [];
  const session = await sessionAt(root, AGENT);
  const io = { ...session.environment.io, err: (text: string) => void errors.push(text) };
  return { errors, session: { ...session, environment: { ...session.environment, io } } };
}

/** A process that lives `ms` milliseconds, and when it ends. */
function living(ms: number) {
  const child = spawn(process.execPath, ["-e", `setTimeout(() => {}, ${ms})`]);
  const ended = new Promise<void>((done) => child.on("exit", () => done()));
  return { pid: child.pid ?? 0, ended };
}

/** Another session's verification, by process `pid`, that takes `weight` places. */
async function runningBy(root: string, pid: number, weight = 1): Promise<void> {
  await mkdir(join(root, RUNNING), { recursive: true });
  const entry = {
    pid,
    command: "pnpm test",
    folder: "/otra/carpeta",
    at: "2026-11-05T09:00:00.000Z",
  };
  await writeFile(
    join(root, RUNNING, `000000000000001-${pid}-1.json`),
    JSON.stringify({ ...entry, weight }),
  );
}

describe("the clone's verification places", () => {
  it("make a task's verification wait while others hold them all, say once who, then run (AC1)", async () => {
    const root = await tempRepo(APP);
    const { session, errors } = await watched(root);
    const first = living(1200);
    const second = living(4000);
    await runningBy(root, first.pid);
    await runningBy(root, second.pid);
    const started = Date.now();
    let ran = 0;
    const result = await inSlots(
      session,
      1,
      "pnpm test",
      async () => {
        ran = Date.now();
        return "hecho";
      },
      { pollMs: 50 },
    );
    expect(result).toBe("hecho");
    // It ran when the first ended, while the second still held its place.
    expect(ran - started).toBeGreaterThanOrEqual(900);
    expect(ran - started).toBeLessThan(3500);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Las ocupan: `pnpm test` en /otra/carpeta");
    // Its place is given back, and the ended one's file is gone.
    expect(
      (await readdir(join(root, RUNNING))).filter((name) => name.includes(`-${process.pid}-`)),
    ).toEqual([]);
    expect(await readdir(join(root, RUNNING))).toHaveLength(1);
    await second.ended;
  });

  it("run at once when the one that held a place ended (AC1)", async () => {
    const root = await tempRepo(APP);
    const { session, errors } = await watched(root);
    const dead = living(0);
    await dead.ended;
    await runningBy(root, dead.pid, 2);
    expect(await inSlots(session, 1, "pnpm test", async () => "hecho", { pollMs: 50 })).toBe(
      "hecho",
    );
    expect(errors).toEqual([]);
  });

  it("make a full verification wait for every verification under way, and later ones wait for it (AC2)", async () => {
    const root = await tempRepo(APP);
    const { session } = await watched(root);
    const task = living(1200);
    await runningBy(root, task.pid);
    const events: string[] = [];
    // The full one takes every place: one is free, but it waits for the task under way.
    const full = inSlots(
      session,
      Number.POSITIVE_INFINITY,
      "pnpm check",
      async () => {
        events.push("completa empieza");
        await new Promise((done) => setTimeout(done, 600));
        events.push("completa acaba");
      },
      { pollMs: 50 },
    );
    await new Promise((done) => setTimeout(done, 200));
    // A task that arrives later waits behind it, though a place is free.
    const later = inSlots(session, 1, "pnpm test", async () => void events.push("tarea"), {
      pollMs: 50,
    });
    await Promise.all([full, later, task.ended]);
    expect(events).toEqual(["completa empieza", "completa acaba", "tarea"]);
  });
});
