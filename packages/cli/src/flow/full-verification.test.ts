// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sessionAt } from "../../test/server/support";
import { AGENT, APP, tempRepo } from "../../test/support";
import { exists } from "../io/files";
import { oneAtATime } from "./full-verification";

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
