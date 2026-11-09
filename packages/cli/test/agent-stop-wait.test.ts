// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  DIST,
  folderOf,
  git,
  person,
  SPEC,
  SPEC_PATH,
  tempRepo,
  testEnv,
  writeFiles,
} from "./support";

// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";
const CHECKS = "checks:\n  levels: { secrets: off }\n";

const LINE = `${CHANGE} espera la decisión de la persona y ningún \`specty wait\` la espera`;
const FAILED = "`specty check --changed` falla";

/** A repository whose change waits for the person to approve its spec. */
async function proposed(config = `${CONFIG()}${CHECKS}`): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  return root;
}

/** The end of the turn of `tool`, with its event on stdin. */
const stop = (root: string, tool: string, input: Record<string, unknown>) =>
  cli(root, ["hook", "agent-stop", tool], { stdin: JSON.stringify(input) });

/** Claude Code's end of turn: what it sends back, or undefined when the turn ends. */
async function claude(root: string, active = false): Promise<string | undefined> {
  const run = await stop(root, "claude-code", {
    hook_event_name: "Stop",
    stop_hook_active: active,
  });
  expect(run.code).toBe(0);
  return run.out === "" ? undefined : JSON.parse(run.out).reason;
}

/** Where the mark of the `wait` of change `id` of `root` lives, shared by every worktree. */
const markPath = (root: string, id = CHANGE) =>
  join(root, git(root, "rev-parse", "--git-path", `common/specty/waits/${id}.json`));

/** Writes the mark a `wait` of process `pid` left, ended with `reason` if given. */
async function mark(root: string, pid: number, reason?: "decided" | "timeout"): Promise<void> {
  const since = new Date().toISOString();
  const holder = { pid, tool: "claude-code", since, intervalMs: 500, timeoutSec: 3600 };
  const ended = reason === undefined ? {} : { ended: { at: since, reason } };
  const path = markPath(root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ ...holder, ...ended })}\n`);
}

const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until the mark of `root`'s change exists, for 5 s at most. */
async function marked(root: string): Promise<void> {
  const exists = () =>
    access(markPath(root)).then(
      () => true,
      () => false,
    );
  for (let look = 0; look < 100 && !(await exists()); look += 1) await pause(50);
  expect(await exists()).toBe(true);
}

describe("the end of the turn while the change waits for the person", () => {
  it("AC1, AC3: with no `specty wait`, sends the agent back once with the line and the card of `next`, before `check --changed`", async () => {
    const root = await proposed();
    // `check --changed` fails too: the rule of `wait` answers first.
    await writeFiles(root, {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
    });
    const reason = await claude(root);
    expect(reason).toContain(LINE);
    expect(reason).toContain(`SPECTY · ${CHANGE} · review`);
    expect(reason).toContain(
      "SIGUIENTE: pide al usuario que revise la spec y la apruebe con `specty approve`",
    );
    // In Claude Code's way, from the hook's agent, though its environment does not say so.
    expect(reason).toContain("Ejecútalo en segundo plano (`run_in_background: true`)");
    expect(reason).not.toContain(FAILED);
    // Already sent back once, as when its `wait` had no mark yet: the turn ends now.
    expect(await claude(root, true)).toBeUndefined();
  });

  it("AC1: in each agent's form and way of waiting", async () => {
    const root = await proposed();
    const codex = await stop(root, "codex", { hook_event_name: "Stop", stop_hook_active: false });
    const reply = JSON.parse(codex.out);
    expect(reply.decision).toBe("block");
    expect(reply.reason).toContain(LINE);
    expect(reply.reason).toContain("Si sigue en marcha, consulta su salida hasta que termine");
    const cursor = await stop(root, "cursor", { status: "completed", loop_count: 0 });
    expect(JSON.parse(cursor.out).followup_message).toContain(
      "Ejecútalo en segundo plano (`block_until_ms: 0`)",
    );
  });

  it("AC1: with a mark of a `wait` that was cut off, or that timed out, sends it back", async () => {
    const root = await proposed();
    await mark(root, deadPid());
    expect(await claude(root)).toContain(LINE);
    await mark(root, process.pid, "timeout");
    expect(await claude(root)).toContain(LINE);
  });

  it("AC1: with pending scope requests, sends it back", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await cli(root, ["next"]);
    expect(await claude(root)).toBeUndefined();
    await cli(root, ["scope", "add", "lib/other.ts", "--reason", "Ayudante"]);
    expect(await claude(root)).toContain(LINE);
  });

  it("AC2: lets the turn end while a `specty wait` of the change is alive, as Claude Code's in the background", async () => {
    const root = await proposed();
    const waiting = cli(root, ["wait", "--interval", "100", "--timeout", "10"], {
      env: { SPECTY_AGENT: "claude-code" },
    });
    await marked(root);
    expect(await claude(root)).toBeUndefined();
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect((await waiting).code).toBe(0);
    // Its `wait` ended because the person decided, and the change no longer waits for them.
    expect(await claude(root)).toBeUndefined();
  });

  it("AC2: leaves `check --changed` as it was when the change does not wait for the person", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    await writeFiles(root, {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
    });
    const reason = await claude(root);
    expect(reason).toContain(FAILED);
    expect(reason).not.toContain("ningún `specty wait`");
  });

  it("AC3: sends Antigravity back once per turn, with its count by conversation", async () => {
    const root = await proposed();
    const turn = {
      conversationId: "c1",
      workspacePaths: [root],
      transcriptPath: "",
      artifactDirectoryPath: "",
      modelName: "gemini",
      executionNum: 0,
      terminationReason: "model_stop",
      fullyIdle: true,
    };
    const first = JSON.parse((await stop(root, "antigravity", turn)).out);
    expect(first.decision).toBe("continue");
    expect(first.reason).toContain(LINE);
    expect(JSON.parse((await stop(root, "antigravity", turn)).out)).toEqual({ decision: "stop" });
  });

  it("AC3: never acts on the event of a subagent", async () => {
    const root = await proposed();
    const run = await stop(root, "codex", {
      hook_event_name: "Stop",
      session_id: "s1",
      agent_id: "a1",
      stop_hook_active: false,
    });
    expect(run).toMatchObject({ code: 0, out: "" });
  });

  it("AC1: judges the change of the folder the conversation entered", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    const folder = folderOf(root);
    await writeFiles(folder, { [SPEC_PATH]: SPEC });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    const enter = await cli(root, ["guard", "--tool", "codex"], {
      stdin: JSON.stringify({
        cwd: root,
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: `specty enter ${CHANGE}` },
      }),
    });
    expect(enter.code).toBe(0);
    const end = (session: string) =>
      stop(root, "codex", { hook_event_name: "Stop", session_id: session, cwd: root });
    expect(JSON.parse((await end("s1")).out).reason).toContain(LINE);
    // Another conversation works in the main folder, where no change waits.
    expect((await end("s2")).out).toBe("");
  });

  it("AC4: in delegated mode, asks the agent to take the decision as `next` says, not to wait", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    const reason = await claude(root);
    expect(reason).toContain(`${CHANGE} espera una decisión que la persona te delegó`);
    expect(reason).toContain("SIGUIENTE: modo delegado: aprueba tú la spec con `specty approve`");
    expect(reason).not.toContain("`specty wait`");
  });

  it("AC5: speaks English", async () => {
    const root = await proposed(`${CONFIG().replace("language: es", "language: en")}${CHECKS}`);
    const reason = await claude(root);
    expect(reason).toContain(
      `${CHANGE} waits for the person's decision and no \`specty wait\` is waiting for it`,
    );
    expect(reason).toContain("NEXT: ask the user to review the spec and approve it");
    expect(reason).toContain("Run it in the background (`run_in_background: true`)");
  });
});

/** A repository with no change whose `specty check --changed` fails. */
async function failing(): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
  await writeFiles(root, {
    "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
  });
  return root;
}

/** The end of the turn of `tool` as `init` installs it, with `--no-check`. */
const unchecked = (root: string, tool: string, input: Record<string, unknown>) =>
  cli(root, ["hook", "agent-stop", tool, "--no-check"], { stdin: JSON.stringify(input) });

/** The same, through the hooks' own entry of the built CLI, as the agent runs it. */
function bundled(root: string, args: readonly string[], input: Record<string, unknown>) {
  return spawnSync(process.execPath, [DIST, "hook", "agent-stop", ...args], {
    cwd: root,
    env: testEnv(),
    input: JSON.stringify(input),
    encoding: "utf8",
  });
}

describe("the end of the turn init installs, without the check", () => {
  it("AC2: with --no-check, sends the agent back to `specty wait` while the change waits for the person", async () => {
    const root = await proposed();
    await writeFiles(root, {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
    });
    const run = await unchecked(root, "claude-code", {
      hook_event_name: "Stop",
      stop_hook_active: false,
    });
    expect(run.code).toBe(0);
    const reason = JSON.parse(run.out).reason;
    expect(reason).toContain(LINE);
    expect(reason).not.toContain(FAILED);
    // Already sent back once: the turn ends.
    const again = await unchecked(root, "claude-code", {
      hook_event_name: "Stop",
      stop_hook_active: true,
    });
    expect(again).toMatchObject({ code: 0, out: "" });
  });

  it("AC2: with --no-check, never runs `check --changed`, though it fails", async () => {
    const root = await failing();
    // Without the mark, as `check --install` leaves it, the check sends the turn back.
    expect(await claude(root)).toContain(FAILED);
    for (const tool of ["claude-code", "codex", "windsurf"]) {
      const run = await unchecked(root, tool, { hook_event_name: "Stop", stop_hook_active: false });
      expect(run, tool).toMatchObject({ code: 0, out: "" });
    }
    const cursor = await unchecked(root, "cursor", { status: "completed", loop_count: 0 });
    expect(cursor).toMatchObject({ code: 0, out: "" });
    // Antigravity wants an answer every time: the one that lets its turn end.
    const turn = { conversationId: "c1", terminationReason: "model_stop", fullyIdle: true };
    expect(JSON.parse((await unchecked(root, "antigravity", turn)).out)).toEqual({
      decision: "stop",
    });
  });

  it("AC2: the hooks' own entry of the built CLI reads the mark too", async () => {
    const root = await failing();
    const event = { hook_event_name: "Stop", stop_hook_active: false };
    const checked = bundled(root, ["claude-code"], event);
    expect(checked.status).toBe(0);
    expect(JSON.parse(checked.stdout).reason).toContain(FAILED);
    const run = bundled(root, ["claude-code", "--no-check"], event);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
  });
});
