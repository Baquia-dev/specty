// SPDX-License-Identifier: Apache-2.0
import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type WaitOptions, wait } from "../src/commands/wait";
import { openSession } from "../src/session";
import {
  AGENT,
  APP,
  CHANGE,
  CONFIG,
  cli,
  DIST,
  git,
  NOW,
  person,
  SPEC,
  SPEC_PATH,
  tempRepo,
  testEnv,
  writeFiles,
} from "./support";

async function implementing(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": CONFIG(),
  });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  return root;
}

describe("specty wait", () => {
  it("AC1: returns immediately with next card when not waiting for human", async () => {
    const root = await tempRepo({
      "src/app.ts": "export const greet = () => 'hola';\n",
      ".specty/config.yaml": CONFIG(),
    });
    const result = await cli(root, ["wait"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("No hay un cambio activo");
  });

  it("AC2, AC3: waits while waiting for human and unblocks when human approves", async () => {
    const root = await tempRepo({
      "src/app.ts": "export const greet = () => 'hola';\n",
      ".specty/config.yaml": CONFIG(),
    });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);

    const waiting = cli(root, ["wait", "--interval", "100", "--timeout", "5"]);
    await new Promise((r) => setTimeout(r, 200));

    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });

    const finished = await waiting;
    expect(finished.code).toBe(0);
    expect(finished.out).toContain("TAREA T1");
  });

  it("AC2: stays waiting while there are multiple pending confirmations and unblocks only when all are resolved", async () => {
    const root = await implementing();
    await cli(root, ["scope", "add", "src/extra1.ts", "--reason", "motivo 1"]);
    await cli(root, ["scope", "add", "src/extra2.ts", "--reason", "motivo 2"]);

    const waiting = cli(root, ["wait", "--interval", "100", "--timeout", "5"]);
    await new Promise((r) => setTimeout(r, 200));

    // Resolve only the first one
    await cli(root, ["approve", "--scope", "S1"], { terminal: person() });
    await new Promise((r) => setTimeout(r, 200));

    // Waiting should still be running
    const race = await Promise.race([
      waiting.then(() => "finished"),
      new Promise((r) => setTimeout(() => r("waiting"), 100)),
    ]);
    expect(race).toBe("waiting");

    // Resolve the second one
    await cli(root, ["approve", "--scope", "S2"], { terminal: person() });

    const finished = await waiting;
    expect(finished.code).toBe(0);
    expect(finished.out).toContain("TAREA T1");
  });

  it("AC4: times out when person takes no action within timeout", async () => {
    const root = await tempRepo({
      "src/app.ts": "export const greet = () => 'hola';\n",
      ".specty/config.yaml": CONFIG(),
    });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);

    const result = await cli(root, ["wait", "--interval", "50", "--timeout", "1"]);
    expect(result.out).toContain("Tiempo de espera agotado");
  });
});

/** A repository whose change waits for the person to approve its spec, with `config` as its configuration. */
async function proposed(config = CONFIG()): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  return root;
}

/** Where the mark of the `wait` of change `id` of `root` lives, shared by every worktree. */
const markPath = (root: string, id = CHANGE) =>
  join(root, git(root, "rev-parse", "--git-path", `common/specty/waits/${id}.json`));

const hasMark = (root: string) =>
  access(markPath(root)).then(
    () => true,
    () => false,
  );

const markOf = async (root: string) => JSON.parse(await readFile(markPath(root), "utf8"));

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until the mark of `root`'s change exists, for 5 s at most. */
async function marked(root: string): Promise<void> {
  for (let look = 0; look < 100 && !(await hasMark(root)); look += 1) await pause(50);
  expect(await hasMark(root)).toBe(true);
}

/** Runs `wait` in `root` as the agent of the tool `env` marks, and what it wrote on stderr. */
async function waitAs(
  root: string,
  env: Record<string, string>,
  options: WaitOptions,
): Promise<readonly string[]> {
  const err: string[] = [];
  const opened = await openSession({
    cwd: root,
    env: testEnv(env),
    now: () => NOW,
    terminal: AGENT,
    io: { out: () => undefined, err: (text) => err.push(text) },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
  });
  if (opened.kind !== "ok") throw new Error("no Specty session");
  await wait(opened.session, options);
  return err;
}

describe("the mark of `specty wait`", () => {
  it("AC1, AC2: while it waits, its mark is alive and renewed; when the person decides, it ends as `decided`", async () => {
    const root = await proposed();
    const waiting = cli(root, ["wait", "--interval", "100", "--timeout", "5"], {
      env: { SPECTY_AGENT: "claude-code" },
    });
    await marked(root);
    const mark = await markOf(root);
    expect(mark).toMatchObject({
      pid: process.pid,
      tool: "claude-code",
      intervalMs: 100,
      timeoutSec: 5,
    });
    expect(Number.isNaN(Date.parse(mark.since))).toBe(false);
    expect(mark.ended).toBeUndefined();
    const before = (await stat(markPath(root))).mtimeMs;
    await pause(300);
    expect((await stat(markPath(root))).mtimeMs).toBeGreaterThan(before);

    const decidedAfter = Date.now();
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect((await waiting).out).toContain("TAREA T1");
    const ended = (await markOf(root)).ended;
    expect(ended.reason).toBe("decided");
    expect(Date.parse(ended.at)).toBeGreaterThanOrEqual(decidedAfter - 1000);
  });

  it("AC2: when its time runs out, the mark ends as `timeout`", async () => {
    const root = await proposed();
    const result = await cli(root, ["wait", "--interval", "50", "--timeout", "1"]);
    expect(result.out).toContain("Tiempo de espera agotado");
    expect((await markOf(root)).ended.reason).toBe("timeout");
  });

  it("AC1: a `wait` that returns at once because nothing waited for the person leaves no mark", async () => {
    const empty = await tempRepo(APP);
    await cli(empty, ["wait"]);
    expect(await hasMark(empty)).toBe(false);

    const root = await implementing();
    expect((await cli(root, ["wait", "--interval", "50", "--timeout", "1"])).out).toContain(
      "TAREA T1",
    );
    expect(await hasMark(root)).toBe(false);
  });

  it("AC3, AC6: without `--timeout`, it waits 55 min, so it wakes up inside the prompt cache's hour", async () => {
    const root = await proposed();
    const waiting = cli(root, ["wait", "--interval", "100"]);
    await marked(root);
    expect((await markOf(root)).timeoutSec).toBe(3300);
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect((await waiting).out).toContain("TAREA T1");
  });
});

/** The configuration of the tests with `internal.waits` set to `waits`. */
const withWaits = (waits: string) => `${CONFIG()}internal:\n  waits:\n${waits}`;

describe("`specty wait` with `internal.waits`", () => {
  it("AC1: without `--timeout`, waits the seconds of `internal.waits.waitTimeoutSec`, and the option still rules", async () => {
    const root = await proposed(withWaits("    waitTimeoutSec: 120\n"));
    const flagged = await cli(root, ["wait", "--interval", "50", "--timeout", "1"]);
    expect(flagged.out).toContain("Tiempo de espera agotado");
    expect((await markOf(root)).timeoutSec).toBe(1);

    const waiting = cli(root, ["wait", "--interval", "100"]);
    // The new `wait` writes its own mark over the one that timed out: 5 s at most.
    for (let look = 0; look < 100 && (await markOf(root)).ended !== undefined; look += 1) {
      await pause(50);
    }
    expect((await markOf(root)).ended).toBeUndefined();
    expect((await markOf(root)).timeoutSec).toBe(120);
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect((await waiting).out).toContain("TAREA T1");
  });

  it("AC2: in Gemini CLI, writes its heartbeat line at most `internal.waits.heartbeatSec` apart", async () => {
    const options: WaitOptions = { interval: 50, timeout: 2 };
    const beats = (err: readonly string[]) =>
      err.filter((line) => line.includes(`sigue esperando la decisión de la persona en ${CHANGE}`));
    const configured = await proposed(withWaits("    heartbeatSec: 1\n"));
    expect(
      beats(await waitAs(configured, { GEMINI_CLI: "1" }, options)).length,
    ).toBeGreaterThanOrEqual(1);
    // Without the key, a minute apart: none in two seconds.
    const usual = await proposed();
    expect(beats(await waitAs(usual, { GEMINI_CLI: "1" }, options))).toEqual([]);
  });

  it("AC3: without `--interval`, looks every `internal.waits.waitIntervalMs` milliseconds, and the option still rules", async () => {
    const root = await proposed(withWaits("    waitIntervalMs: 200\n"));
    expect((await cli(root, ["wait", "--timeout", "1"])).out).toContain("Tiempo de espera agotado");
    expect((await markOf(root)).intervalMs).toBe(200);
    await cli(root, ["wait", "--interval", "100", "--timeout", "1"]);
    expect((await markOf(root)).intervalMs).toBe(100);
    // Without either, every 500 ms, as before.
    const usual = await proposed();
    expect((await cli(usual, ["wait", "--timeout", "1"])).out).toContain(
      "Tiempo de espera agotado",
    );
    expect((await markOf(usual)).intervalMs).toBe(500);
  });
});

describe("the heartbeat of `specty wait`", () => {
  const options: WaitOptions = { interval: 50, timeout: 1, beatMs: 200 };
  const beats = (err: readonly string[]) =>
    err.filter((line) => line.includes(`sigue esperando la decisión de la persona en ${CHANGE}`));

  it("AC4: in Gemini CLI, it writes a heartbeat line with the change and its minutes, never further apart than its limit", async () => {
    const root = await proposed();
    const lines = beats(await waitAs(root, { GEMINI_CLI: "1" }, options));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toContain("(0 de 1 min)");
  });

  it("AC4: in another tool, it writes no heartbeat line", async () => {
    const root = await proposed();
    expect(beats(await waitAs(root, { SPECTY_AGENT: "claude-code" }, options))).toEqual([]);
  });
});
