// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../../src/io/files";
import { changeRuns, type Run } from "../../src/server/runs";
import { AGENT, APP, CHANGE, CONFIG, cli, SPEC, SPEC_PATH, tempRepo, writeFiles } from "../support";
import { implemented, sessionAt } from "./support";

const LOCKS = ".git/common/specty/locks";
const LOCK = `${LOCKS}/full-verification.json`;
const WAITING = "otra sesión está haciendo una verificación completa";
/** The full verification leaves a mark in the change's folder when it runs. */
const MARKED = `node -e "require('fs').writeFileSync('ran', 'x')"`;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Waits, in real time, until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (!done()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await wait(20);
  }
}

/** A change in acceptance whose full verification leaves a mark. */
async function inAcceptance(): Promise<string> {
  const config = `${CONFIG()}  full: ${JSON.stringify(MARKED)}\n`;
  const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await implemented(root, "1\n", "2\n");
  return root;
}

/** Another session's live process, holding the full verification's turn until it is killed. */
function otherSessionVerifies(root: string) {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
  const holder = {
    pid: child.pid ?? 0,
    command: "pnpm check",
    folder: "/otra/carpeta",
    at: "2026-11-04T08:00:00.000Z",
  };
  mkdirSync(join(root, LOCKS), { recursive: true });
  writeFileSync(join(root, LOCK), JSON.stringify(holder));
  return child;
}

describe("the full verification started from the UI", () => {
  it("AC1: waits for another session's turn, says who has it, and runs once it is free", async () => {
    const root = await inAcceptance();
    const session = await sessionAt(root, AGENT);
    const heard: (Run | undefined)[] = [];
    const runs = changeRuns(session, (id, run) => {
      if (id === CHANGE) heard.push(run);
    });
    const other = otherSessionVerifies(root);
    try {
      await runs.start(CHANGE);
      await until(() => heard.some((run) => run?.output.some((line) => line.includes(WAITING))));
      const note = heard.flatMap((run) => run?.output ?? []).find((line) => line.includes(WAITING));
      expect(note).toContain("(`pnpm check` en /otra/carpeta, desde las 08:00 UTC)");
      await wait(500);
      expect(await exists(join(root, "ran"))).toBe(false);
      other.kill();
      await until(() => heard.at(-1) === undefined && heard.length > 1);
      expect(await exists(join(root, "ran"))).toBe(true);
      const audit = readFileSync(join(root, ".specty", "changes", CHANGE, "audit.jsonl"), "utf8");
      expect(audit).toContain('"change.verified"');
    } finally {
      other.kill();
      runs.close();
    }
  });

  it("AC2: frees the turn when it ends", async () => {
    const root = await inAcceptance();
    const session = await sessionAt(root, AGENT);
    // Each notice, with whether the turn was still held as it was heard.
    const heard: { readonly run: Run | undefined; readonly held: boolean }[] = [];
    const runs = changeRuns(session, (id, run) => {
      if (id === CHANGE) heard.push({ run, held: existsSync(join(root, LOCK)) });
    });
    try {
      await runs.start(CHANGE);
      await until(() => heard.length > 1 && heard.at(-1)?.run === undefined);
      expect(await exists(join(root, "ran"))).toBe(true);
      // Its end is heard with the turn already free: whoever hears it can take the turn at once.
      expect(heard.at(-1)).toEqual({ run: undefined, held: false });
      expect(await exists(join(root, LOCK))).toBe(false);
    } finally {
      runs.close();
    }
  });
});
