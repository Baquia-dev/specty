// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

/** A repository whose change waits for the person to accept it, with a quick `verify.full`. */
async function inAcceptance() {
  const root = await tempRepo({
    ...APP,
    ".specty/config.yaml": `${CONFIG()}  full: "echo completa"\n`,
  });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  await writeFiles(root, { "src/app.ts": "1\n" });
  await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
  await writeFiles(root, { "src/app.ts": "2\n" });
  await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
  return root;
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
    at: "2026-11-04T14:05:00.000Z",
  };
  await writeFile(join(locks, "full-verification.json"), JSON.stringify(holder));
  return { ended };
}

describe("the time accept records for its full verification", () => {
  it("AC4: counts only from its turn, not the wait for another session's", async () => {
    const root = await inAcceptance();
    const { ended } = await heldFor(root, 2500);
    const accepted = await cli(root, ["accept"], { terminal: person() });
    await ended;
    expect(accepted.err).toContain("otra sesión está haciendo una verificación completa");
    const audit = (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`))
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line): { event: string; data: { ms?: number; cmd?: string } } => JSON.parse(line));
    const verified = audit.filter((entry) => entry.event === "change.verified");
    expect(verified).toHaveLength(1);
    expect(verified[0]?.data.cmd).toBe("echo completa");
    expect(verified[0]?.data.ms).toBeLessThan(1500);
  });
});
