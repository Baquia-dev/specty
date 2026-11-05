// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFIG,
  cli,
  APP as FILES,
  git,
  inWorktree,
  person,
  toClosing,
  writeFiles,
} from "./support";

/** A change ready to close whose merge of main conflicts, left in its folder for the agent. */
async function conflictForAgent() {
  const { root, folder } = await inWorktree({
    ...FILES,
    ".specty/config.yaml": `${CONFIG()}  full: "echo completa"\n`,
  });
  await toClosing(folder);
  await writeFiles(root, { "src/app.ts": "main\n" });
  git(root, "commit", "-q", "-am", "main cambia el saludo");
  const closed = await cli(folder, ["close"], { terminal: person() });
  expect(closed.out).toContain("el merge queda en esta carpeta para que lo resuelva el agente");
  return { root, folder };
}

/** Another session's full verification, by a process that lives `ms` milliseconds. */
async function heldFor(root: string, ms: number): Promise<{ readonly ended: Promise<void> }> {
  const child = spawn(process.execPath, ["-e", `setTimeout(() => {}, ${ms})`]);
  const ended = new Promise<void>((done) => child.on("exit", () => done()));
  const locks = join(root, ".git/common/specty/locks");
  await mkdir(locks, { recursive: true });
  const holder = {
    pid: child.pid ?? 0,
    command: "pnpm check",
    folder: "/otra/carpeta",
    at: "2026-11-05T09:05:00.000Z",
  };
  await writeFile(join(locks, "full-verification.json"), JSON.stringify(holder));
  return { ended };
}

describe("`specty integrate`", () => {
  it("waits for another session's full verification before its own (AC3)", async () => {
    const { root, folder } = await conflictForAgent();
    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    const other = await heldFor(root, 1500);
    const started = Date.now();
    const integrated = await cli(folder, ["integrate"]);
    expect(integrated.code).toBe(0);
    expect(integrated.err).toContain("otra sesión está haciendo una verificación completa");
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    await other.ended;
  });
});
