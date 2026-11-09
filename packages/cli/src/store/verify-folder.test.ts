// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sessionAt } from "../../test/server/support";
import { AGENT, APP, CONFIG, tempRepo } from "../../test/support";
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
  const ended = new Promise<number>((done) => child.on("exit", () => done(Date.now())));
  return { pid: child.pid ?? 0, ended };
}

/** What runs in a folder: process `pid`'s `command`, taking `weight` places (0 for a check's). */
interface Entry {
  readonly pid: number;
  readonly folder: string;
  readonly weight: number;
  readonly command?: string;
}

/** Writes the file of what runs, as another process would. */
async function runningBy(root: string, { pid, folder, weight, command }: Entry): Promise<void> {
  await mkdir(join(root, RUNNING), { recursive: true });
  const entry = { pid, command: command ?? "pnpm check", folder, at: "2026-11-09T09:00:00.000Z" };
  await writeFile(
    join(root, RUNNING, `000000000000001-${pid}-1.json`),
    JSON.stringify({ ...entry, weight }),
  );
}

/** Runs a verification that takes `weight` places, and when its command started. */
async function verifyAt(session: Awaited<ReturnType<typeof watched>>["session"], weight = 1) {
  let ran = 0;
  const result = await inSlots(
    session,
    weight,
    "pnpm test",
    async () => {
      ran = Date.now();
      return "hecho";
    },
    { pollMs: 50 },
  );
  return { result, ran };
}

describe("a verification in a folder where another of Specty runs", () => {
  it("AC1: waits for another process's verification in its folder though a place is free, says so once, then runs", async () => {
    const root = await tempRepo(APP);
    const { session, errors } = await watched(root);
    const other = living(1200);
    await runningBy(root, {
      pid: other.pid,
      folder: session.root,
      weight: 1,
      command: "pnpm --filter ui test",
    });
    const started = Date.now();
    const { result, ran } = await verifyAt(session);
    expect(result).toBe("hecho");
    expect(ran - started).toBeGreaterThanOrEqual(900);
    expect(ran).toBeGreaterThanOrEqual((await other.ended) - 100);
    expect(errors).toEqual([
      "specty: en esta carpeta ya corre otro comando de verificación de Specty (`pnpm --filter ui test`, desde las 09:00 UTC); espero a que termine para que no se pisen, por ejemplo en la carpeta de la cobertura…",
    ]);
    // Its own file is gone once it ends, and so is the ended one's.
    expect(await readdir(join(root, RUNNING))).toEqual([]);
  });

  it("AC1: runs at once and says nothing when the other runs in another folder and a place is free", async () => {
    const root = await tempRepo(APP);
    const { session, errors } = await watched(root);
    const other = living(3000);
    await runningBy(root, { pid: other.pid, folder: "/otra/carpeta", weight: 1 });
    const started = Date.now();
    const { ran } = await verifyAt(session);
    expect(ran - started).toBeLessThan(1500);
    expect(errors).toEqual([]);
    await other.ended;
  });
});

describe("a verification in a folder where a command of specty check runs", () => {
  it("AC2: the full verification waits for the check's command of another process in its folder", async () => {
    const root = await tempRepo(APP);
    const { session, errors } = await watched(root);
    const check = living(1200);
    await runningBy(root, {
      pid: check.pid,
      folder: session.root,
      weight: 0,
      command: "pnpm test",
    });
    const started = Date.now();
    const { ran } = await verifyAt(session, Number.POSITIVE_INFINITY);
    expect(ran - started).toBeGreaterThanOrEqual(900);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("(`pnpm test`, desde las 09:00 UTC)");
    await check.ended;
  });

  it("AC2: the check's command takes no place: with one place, a verification of another folder runs at once", async () => {
    const config = `${CONFIG()}  slots: 1\n`;
    const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
    const { session, errors } = await watched(root);
    expect(session.config.verify.slots).toBe(1);
    const check = living(3000);
    await runningBy(root, { pid: check.pid, folder: "/otra/carpeta", weight: 0 });
    const started = Date.now();
    const { ran } = await verifyAt(session);
    expect(ran - started).toBeLessThan(1500);
    expect(errors).toEqual([]);
    await check.ended;
  });
});

describe("a verification in a folder where its own process runs another", () => {
  it("AC3: does not wait for the folder's verification of a process that started it", async () => {
    const root = await tempRepo(APP);
    const { session, errors } = await watched(root);
    await runningBy(root, { pid: process.ppid, folder: session.root, weight: 1 });
    const started = Date.now();
    const { ran } = await verifyAt(session);
    expect(ran - started).toBeLessThan(1500);
    expect(errors).toEqual([]);
  });

  it("AC3: does not wait for the folder's verification of its own process", async () => {
    const root = await tempRepo(APP);
    const { session, errors } = await watched(root);
    await runningBy(root, { pid: process.pid, folder: session.root, weight: 1 });
    const started = Date.now();
    const { ran } = await verifyAt(session);
    expect(ran - started).toBeLessThan(1500);
    expect(errors).toEqual([]);
  });
});
