// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  git,
  inWorktree,
  person,
  read,
  SPEC_PATH,
  stateIn,
  toAcceptance,
  tryGit,
  writeFiles,
} from "./support";

const BRANCH = `specty/${CHANGE}`;

/**
 * The full verification: it notes each run in the repository's `runs`, `o` when the code it
 * verifies has main's newer work (`src/other.ts`) and `x` when it does not. With `other`, on its
 * first run another session arrives meanwhile and waits in the turn's queue to land.
 */
const VERIFY = `const { spawn } = require("node:child_process");
const { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const [given, other] = process.argv.slice(2);
const common = resolve(given);
const locks = join(common, "common/specty/locks");
const runs = join(common, "runs");
appendFileSync(runs, existsSync("src/other.ts") ? "o" : "x");
if (other !== undefined && readFileSync(runs, "utf8").length === 1) {
  const child = spawn(process.execPath, [other, common], { detached: true, stdio: "ignore" });
  child.unref();
  const queue = join(locks, "full-verification.queue");
  mkdirSync(queue, { recursive: true });
  const holder = { pid: child.pid, command: "pnpm check", folder: "/otra/carpeta", at: new Date().toISOString() };
  const name = String(Date.now()).padStart(15, "0") + "-" + child.pid + "-1.json";
  writeFileSync(join(queue, name), JSON.stringify(holder));
}
`;

/**
 * The other session: as soon as nobody holds the turn, it lands its own work on main, and then
 * leaves a mark that it did.
 */
const OTHER = `const { execFileSync } = require("node:child_process");
const { existsSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const [common] = process.argv.slice(2);
const root = dirname(common);
const lock = join(common, "common/specty/locks/full-verification.json");
const land = () => {
  if (existsSync(lock)) return setTimeout(land, 20);
  writeFileSync(join(root, "src/third.ts"), "export const third = 1;\\n");
  execFileSync("git", ["add", "src/third.ts"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "otra sesión aterriza"], { cwd: root });
  writeFileSync(join(common, "other-landed"), "");
};
land();
`;

/** `VERIFY` as a full verification command; with `other`, another session arrives while it runs. */
async function fullVerification(other: boolean): Promise<string> {
  const scripts = await realpath(await mkdtemp(join(tmpdir(), "specty-aterrizaje-")));
  await writeFile(join(scripts, "verify.cjs"), VERIFY);
  await writeFile(join(scripts, "other.cjs"), OTHER);
  const lands = other ? ` "${join(scripts, "other.cjs")}"` : "";
  return `node "${join(scripts, "verify.cjs")}" "$(git rev-parse --git-common-dir)"${lands}`;
}

/** The marks of the full verifications that ran, or "" when none did. */
const runs = async (root: string): Promise<string> =>
  existsSync(join(root, ".git/runs")) ? read(root, ".git/runs") : "";

/** Main moves on with a file the change does not touch. */
async function mainMoves(root: string): Promise<void> {
  await writeFiles(root, { "src/other.ts": "export const other = 1;\n" });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "otro trabajo en main");
}

/** The incorporation's events in the audit of SPEC's change in `folder`, oldest first. */
async function incorporation(folder: string): Promise<string[]> {
  const kept = new Set(["integration.started", "integration.resolved", "change.verified"]);
  return (await read(folder, `.specty/changes/${CHANGE}/audit.jsonl`))
    .trim()
    .split("\n")
    .map((line): string => JSON.parse(line).event)
    .filter((event) => kept.has(event));
}

/**
 * SPEC's change in acceptance, in its worktree, with `full` as its full verification: main
 * changed the greeting it rewrote, so accepting left the merge for the agent. `delegated` turns
 * delegated mode on, and the agent sends its closing and accepts; otherwise, the person accepts.
 */
async function conflictOnAcceptance({ delegated = false, other = false } = {}) {
  const full = await fullVerification(other);
  const { root, folder } = await inWorktree({
    ...APP,
    ".specty/config.yaml": `${CONFIG()}  full: ${JSON.stringify(full)}\n`,
  });
  await toAcceptance(folder);
  if (delegated) {
    const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    expect(on.code).toBe(0);
    const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
    await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${closing}` });
    expect((await cli(folder, ["propose"])).out).toContain("Cierre válido.");
  }
  await writeFiles(root, { "src/app.ts": "main\n" });
  git(root, "commit", "-q", "-am", "main cambia el saludo");
  const refused = delegated
    ? await cli(folder, ["accept"])
    : await cli(folder, ["accept"], { terminal: person() });
  expect(refused.code).toBe(2);
  expect(refused.out).toContain("el merge queda en esta carpeta para que lo resuelva el agente");
  expect(await runs(root)).toBe("");
  return { root, folder };
}

/** Waits until the other session landed its work on main. */
async function otherLanded(root: string): Promise<void> {
  for (let tries = 0; tries < 500; tries += 1) {
    if (existsSync(join(root, ".git/other-landed"))) return;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error("the other session never landed");
}

describe("`specty integrate` on the landing turn", () => {
  it("AC1: with main moved on meanwhile, commits the resolution, brings main in again and verifies once, with all of it", async () => {
    const { root, folder } = await conflictOnAcceptance();
    await mainMoves(root);
    const main = git(root, "rev-parse", "main");
    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    const integrated = await cli(folder, ["integrate"]);
    expect(integrated.code).toBe(0);
    // One verification, of the code with main's newer work, and none of the stale merge.
    expect(await runs(root)).toBe("o");
    expect(integrated.out).toContain("Incorporación de main resuelta (merge ");
    expect(integrated.out).toContain(
      "main avanzó mientras se resolvía la incorporación: se incorporó otra vez antes de verificar, así que la verificación corre una vez, con todo main.",
    );
    expect(integrated.out).toMatch(
      /Antes, main se incorporó a la rama del cambio \(merge [0-9a-f]{7}\)/,
    );
    expect(await incorporation(folder)).toEqual([
      "integration.started",
      "integration.resolved",
      "change.verified",
    ]);
    expect(tryGit(folder, "merge-base", "--is-ancestor", "main", "HEAD").status).toBe(0);
    expect(tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status).not.toBe(0);
    expect(await read(folder, "src/app.ts")).toBe("resuelto\n");
    expect(await read(folder, "src/other.ts")).toBe("export const other = 1;\n");
    // Main does not move: the person still accepts.
    expect(git(root, "rev-parse", "main")).toBe(main);
  });

  it("AC2: when main's newer work conflicts again, commits the resolution and leaves the new merge for the agent, with no verification", async () => {
    const { root, folder } = await conflictOnAcceptance();
    await writeFiles(root, { "src/app.ts": "main otra vez\n" });
    git(root, "commit", "-q", "-am", "main vuelve a cambiar el saludo");
    const main = git(root, "rev-parse", "main");
    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    const integrated = await cli(folder, ["integrate"]);
    expect(integrated.code).toBe(2);
    expect(integrated.out).toContain(
      "el merge queda en esta carpeta para que lo resuelva el agente",
    );
    expect(integrated.out).toContain("CONFLICTOS:\n  src/app.ts");
    expect(await runs(root)).toBe("");
    expect(await incorporation(folder)).toEqual([
      "integration.started",
      "integration.resolved",
      "integration.started",
    ]);
    const state = await stateIn(folder);
    expect(state).toHaveProperty("integration.conflicts", ["src/app.ts"]);
    expect(state).toHaveProperty("integration.commit", main);
    expect(state).not.toHaveProperty("integration.resolved");
    // The resolution has its commit, and the new merge waits in the folder.
    expect(git(folder, "log", "-1", "--format=%s", "HEAD")).toBe(
      `Merge branch 'main' into ${BRANCH}`,
    );
    expect(git(folder, "show", "HEAD:src/app.ts")).toBe("resuelto");
    expect(tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status).toBe(0);
    expect(git(root, "rev-parse", "main")).toBe(main);
  });

  it("AC3: in delegated mode, goes on with the acceptance on the same turn: it lands with one verification, and another session lands after it", async () => {
    const { root, folder } = await conflictOnAcceptance({ delegated: true, other: true });
    await mainMoves(root);
    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    const integrated = await cli(folder, ["integrate"]);
    expect(integrated.code).toBe(0);
    expect(integrated.out).toContain("Incorporación de main resuelta (merge ");
    expect(integrated.out).toContain("Cambio aceptado, cerrado y archivado");
    expect(integrated.out).toContain("Incorporado a main.");
    expect(integrated.out).not.toContain("vuelve a ejecutar tú `specty accept`");
    await otherLanded(root);
    // One verification, with all of main, and the acceptance did not repeat it.
    expect(await runs(root)).toBe("o");
    // The other session landed after the change, on top of it, and not in between.
    expect(tryGit(root, "cat-file", "-e", `${BRANCH}:src/third.ts`).status).not.toBe(0);
    expect(git(root, "rev-parse", "main~1")).toBe(git(root, "rev-parse", BRANCH));
    expect(git(root, "log", "-1", "--format=%s", "main")).toBe("otra sesión aterriza");
  });

  it("AC4: outside delegated mode, neither accepts nor closes, and the person's `accept` does not verify again", async () => {
    const { root, folder } = await conflictOnAcceptance();
    const main = git(root, "rev-parse", "main");
    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    const integrated = await cli(folder, ["integrate"]);
    expect(integrated.code).toBe(0);
    expect(integrated.out).toContain("pide al usuario que vuelva a ejecutar `specty accept`");
    expect(integrated.out).not.toContain("Cambio aceptado");
    expect((await stateIn(folder)).phase).toBe("acceptance");
    expect(git(root, "rev-parse", "main")).toBe(main);
    expect(await runs(root)).toBe("x");
    const terminal = person();
    const accepted = await cli(folder, ["accept"], { terminal });
    expect(accepted.code).toBe(0);
    expect(terminal.notes.join("\n")).toContain("no se repite");
    expect(await runs(root)).toBe("x");
  });
});
