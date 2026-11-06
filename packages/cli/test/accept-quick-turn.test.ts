// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accept } from "../src/commands/accept";
import { openSession, type Session, type Terminal } from "../src/session";
import {
  APP,
  ARCHIVE,
  CHANGE,
  CONFIG,
  cli,
  DIST,
  git,
  inWorktree,
  NOW,
  person,
  quickInWorktree,
  read,
  SPEC_PATH,
  stateIn,
  tempRepo,
  testEnv,
  toAcceptance,
  tryGit,
  writeFiles,
} from "./support";

const LOCK = ".git/common/specty/locks/full-verification.json";
const MERGED = /Antes, main se incorporó a la rama del cambio/;

/**
 * The full verification: it notes each run in the repository's `runs`, `x` when it has the turn
 * and `?` when it does not. With `other`, on its first run another session arrives meanwhile and
 * waits in the turn's queue to land.
 */
const VERIFY = `const { spawn } = require("node:child_process");
const { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const [given, other] = process.argv.slice(2);
const common = resolve(given);
const locks = join(common, "common/specty/locks");
const runs = join(common, "runs");
appendFileSync(runs, existsSync(join(locks, "full-verification.json")) ? "x" : "?");
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
  writeFileSync(join(root, "src/other.ts"), "export const other = 1;\\n");
  execFileSync("git", ["add", "src/other.ts"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "otra sesión aterriza"], { cwd: root });
  writeFileSync(join(common, "other-landed"), "");
};
land();
`;

/** `VERIFY` as a full verification command; with `other`, another session arrives while it runs. */
async function fullVerification(other: boolean): Promise<string> {
  const scripts = await realpath(await mkdtemp(join(tmpdir(), "specty-turno-")));
  await writeFile(join(scripts, "verify.cjs"), VERIFY);
  await writeFile(join(scripts, "other.cjs"), OTHER);
  const lands = other ? ` "${join(scripts, "other.cjs")}"` : "";
  return `node "${join(scripts, "verify.cjs")}" "$(git rev-parse --git-common-dir)"${lands}`;
}

/**
 * A quick change in acceptance, in its worktree, with delegated mode on and `VERIFY` as its full
 * verification; with `other`, another session arrives while it runs.
 */
async function quickChange(other = false) {
  const full = await fullVerification(other);
  const root = await tempRepo({
    ...APP,
    "src/button.ts": "Sing in\n",
    ".specty/config.yaml": `${CONFIG()}  full: ${JSON.stringify(full)}\n`,
  });
  const { id, folder } = await quickInWorktree(
    root,
    "Corregir botón",
    "corregir-boton",
    "Sign in\n",
  );
  const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
  expect(on.code).toBe(0);
  return { root, folder, branch: `specty/${id}` };
}

/** Waits until the other session landed its work on main. */
async function otherLanded(root: string): Promise<void> {
  for (let tries = 0; tries < 500; tries += 1) {
    if (existsSync(join(root, ".git/other-landed"))) return;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error("the other session never landed");
}

/** `terminal`, noting at each question whether the full verification's turn is taken in `root`. */
function watching(root: string, terminal: Terminal): Terminal & { readonly turns: boolean[] } {
  const turns: boolean[] = [];
  return {
    ...terminal,
    turns,
    confirm: (message: string) => {
      turns.push(existsSync(join(root, LOCK)));
      return terminal.confirm(message);
    },
  };
}

/** The person deciding on the UI's screen: what they chose there is already decided. */
const screen: Terminal = {
  interactive: true,
  channel: "ui",
  confirm: () => Promise.resolve(true),
  choose: () => Promise.resolve(undefined),
  chooseMany: () => Promise.resolve(undefined),
  ask: () => Promise.resolve(undefined),
  note: () => undefined,
};

/** A session in `cwd` with `terminal`, as the server opens one for each action. */
async function sessionAt(cwd: string, terminal: Terminal): Promise<Session> {
  const opened = await openSession({
    cwd,
    env: testEnv(),
    now: () => NOW,
    terminal,
    io: { out: () => undefined, err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
  });
  if (opened.kind !== "ok") throw new Error(`no Specty session in ${cwd}`);
  return opened.session;
}

describe("accepting a quick change lands it on one turn in delegated mode", () => {
  it("AC1: verifies once on its turn, and another session that waits lands only after it", async () => {
    const { root, folder, branch } = await quickChange(true);
    // The agent accepts for the person: no terminal, delegated mode.
    const accepted = await cli(folder, ["accept"]);
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
    expect(accepted.out).toContain("Incorporado a main.");
    await otherLanded(root);
    // One verification, with the turn, and the closing merged nothing.
    expect(await read(root, ".git/runs")).toBe("x");
    expect(accepted.out).not.toMatch(MERGED);
    // The other session landed after the change, on top of it, and not in between.
    expect(tryGit(root, "cat-file", "-e", `${branch}:src/other.ts`).status).not.toBe(0);
    expect(git(root, "rev-parse", "main~1")).toBe(git(root, "rev-parse", branch));
    expect(git(root, "log", "-1", "--format=%s", "main")).toBe("otra sesión aterriza");
  });

  it("AC2: the person at the terminal answers with no turn taken, also in delegated mode", async () => {
    const { root, folder, branch } = await quickChange();
    const terminal = watching(root, person());
    const accepted = await cli(folder, ["accept"], { terminal });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
    expect(terminal.turns.length).toBeGreaterThan(0);
    expect(terminal.turns).not.toContain(true);
    // The verification still runs on the turn, and the change lands.
    expect(await read(root, ".git/runs")).toBe("x");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", branch));
  });

  it("AC2: the person on the UI answers with no turn taken, also in delegated mode", async () => {
    const { root, folder, branch } = await quickChange();
    const terminal = watching(root, screen);
    const accepted = await accept(await sessionAt(folder, terminal), false);
    expect(accepted.status).toBe("ok");
    expect(terminal.turns.length).toBeGreaterThan(0);
    expect(terminal.turns).not.toContain(true);
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", branch));
  });
});

const CLOSING =
  "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n\n### Pendientes\n\n- Exportar a CSV.\n";

/**
 * SPEC's change in acceptance, in its worktree, with delegated mode on and `full` as its full
 * verification (`VERIFY` unless given; with `other`, another session arrives while it runs).
 */
async function normalChange({ other = false, full }: { other?: boolean; full?: string } = {}) {
  const command = full ?? (await fullVerification(other));
  const { root, folder } = await inWorktree({
    ...APP,
    ".specty/config.yaml": `${CONFIG()}  full: ${JSON.stringify(command)}\n`,
  });
  await toAcceptance(folder);
  const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
  expect(on.code).toBe(0);
  return { root, folder, branch: `specty/${CHANGE}` };
}

/** The agent writes the closing in acceptance and sends it. */
async function sendClosing(folder: string): Promise<void> {
  await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${CLOSING}` });
  expect((await cli(folder, ["propose"])).out).toContain("Cierre válido.");
}

describe("accepting a change with its closing sent closes it on one turn in delegated mode", () => {
  it("AC2: verifies once on its turn, accepts, archives and lands, and another session lands only after it", async () => {
    const { root, folder, branch } = await normalChange({ other: true });
    await sendClosing(folder);
    const accepted = await cli(folder, ["accept"]);
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
    expect(accepted.out).toContain("Incorporado a main.");
    expect(accepted.out).toContain("PENDIENTES QUE QUEDAN EN LA MEMORIA:\n  P1 · Exportar a CSV.");
    await otherLanded(root);
    // One verification, with the turn, and the closing merged nothing.
    expect(await read(root, ".git/runs")).toBe("x");
    expect(accepted.out).not.toMatch(MERGED);
    // The other session landed after the change, on top of it, and not in between.
    expect(tryGit(root, "cat-file", "-e", `${branch}:src/other.ts`).status).not.toBe(0);
    expect(git(root, "rev-parse", "main~1")).toBe(git(root, "rev-parse", branch));
    const audit = await read(root, `${ARCHIVE}/${CHANGE}/audit.jsonl`);
    expect(audit).toContain("change.accepted");
    expect(audit).toContain("change.closed");
  });

  it("AC3: without the closing sent, accepts as before and leaves the change in closing", async () => {
    const { root, folder, branch } = await normalChange();
    const accepted = await cli(folder, ["accept"]);
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain("Resultado aceptado; el agente redactará el cierre.");
    expect((await stateIn(folder)).phase).toBe("closing");
    expect(existsSync(join(root, ARCHIVE, CHANGE))).toBe(false);
    expect(git(root, "rev-parse", "main")).not.toBe(git(root, "rev-parse", branch));
  });

  it("AC4: a failing verification leaves it in acceptance with its closing sent, nothing archived nor landed", async () => {
    const { root, folder } = await normalChange({ full: "false" });
    await sendClosing(folder);
    const main = git(root, "rev-parse", "main");
    const accepted = await cli(folder, ["accept"]);
    expect(accepted.out).toContain("en modo delegado no se acepta");
    expect(await stateIn(folder)).toMatchObject({
      phase: "acceptance",
      closingSubmittedAt: expect.any(String),
    });
    expect(await read(folder, SPEC_PATH)).toContain("## Cierre");
    expect(existsSync(join(folder, ARCHIVE, CHANGE))).toBe(false);
    expect(existsSync(join(root, ARCHIVE, CHANGE))).toBe(false);
    expect(git(root, "rev-parse", "main")).toBe(main);
  });
});
