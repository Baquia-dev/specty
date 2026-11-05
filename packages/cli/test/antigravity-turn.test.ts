// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  folderOf,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";
const CHECKS = "checks:\n  levels: { secrets: off }\n";
const HOOKS = ".agents/hooks.json";

/** What every Antigravity hook receives, in its own names. */
const common = (root: string, conversation = "c1") => ({
  conversationId: conversation,
  workspacePaths: [root],
  transcriptPath: "",
  artifactDirectoryPath: "",
  modelName: "gemini",
});

/**
 * Its end of turn, as `Stop` sends it; `fullyIdle` is false while its subagents run, and
 * `lastUserInput` is the person's text in the main conversation and empty in a subagent's.
 */
const stop = (
  root: string,
  conversation: string,
  terminationReason = "model_stop",
  fullyIdle = true,
  lastUserInput?: string,
) =>
  cli(root, ["hook", "agent-stop", "antigravity"], {
    stdin: JSON.stringify({
      ...common(root, conversation),
      executionNum: 0,
      terminationReason,
      fullyIdle,
      ...(lastUserInput === undefined ? {} : { lastUserInput }),
    }),
  });

/** Whether Specty left the turn of `conversation` pending (sent back) in the folder `root`. */
const pending = (root: string, conversation: string) =>
  existsSync(
    join(
      resolve(root, git(root, "rev-parse", "--git-path", "specty/pending")),
      `${conversation}.stop`,
    ),
  );

/** A repository whose `specty check --changed` fails. */
async function failing(): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
  await writeFiles(root, {
    "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
  });
  return root;
}

const guard = (root: string, event: string, input: Record<string, unknown>) =>
  cli(root, ["guard", "--tool", "antigravity", "--event", event], {
    stdin: JSON.stringify({ ...common(root), ...input }),
  });

/** Its reply: always JSON, always exit 0. */
const answer = async (reply: Promise<{ code: number; out: string }>) => {
  const { code, out } = await reply;
  expect(code).toBe(0);
  return JSON.parse(out);
};

/** A repository whose change is implementing T1 (`src/app.ts`, `src/app.test.ts`). */
async function implementing(): Promise<string> {
  const root = await tempRepo(APP);
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person() });
  await cli(root, ["next"]);
  return root;
}

describe("the end of Antigravity's turn", () => {
  it("sends it back to work once per turn while specty check --changed fails (AC1)", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    await writeFiles(root, {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
    });
    const back = await answer(stop(root, "c1"));
    expect(back.decision).toBe("continue");
    expect(back.reason).toContain(
      "`specty check --changed` falla; corrígelo antes de terminar el turno:",
    );
    expect(back.reason).toContain(`FALLA todo\n  src/app.ts:2 ${TODO} sin referencia a un issue`);
    // Already sent back once: it may end now, so that it never loops.
    expect(await answer(stop(root, "c1"))).toEqual({ decision: "stop" });
    // The next turn is checked again.
    expect((await answer(stop(root, "c1"))).decision).toBe("continue");
    expect(await answer(stop(root, "c2", "max_steps_exceeded"))).toEqual({ decision: "stop" });

    const clean = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    expect(await answer(stop(clean, "c1"))).toEqual({ decision: "stop" });
  });

  it("AC5: sends it back once per turn when its CLI ends the turn with no tool call", async () => {
    const root = await failing();
    const back = await answer(stop(root, "c1", "NO_TOOL_CALL"));
    expect(back.decision).toBe("continue");
    expect(back.reason).toContain(
      "`specty check --changed` falla; corrígelo antes de terminar el turno:",
    );
    expect(await answer(stop(root, "c1", "NO_TOOL_CALL"))).toEqual({ decision: "stop" });
    expect((await answer(stop(root, "c1", "NO_TOOL_CALL"))).decision).toBe("continue");
  });

  it("AC6: lets the turn end while its subagents run, and sends it back once they are done", async () => {
    const root = await failing();
    expect(await answer(stop(root, "c1", "NO_TOOL_CALL", false))).toEqual({ decision: "stop" });
    expect(await answer(stop(root, "c1", "model_stop", false))).toEqual({ decision: "stop" });
    // The turn's way back is still there: the end once they are done is checked.
    expect((await answer(stop(root, "c1", "NO_TOOL_CALL"))).decision).toBe("continue");
  });

  it("AC3: lets a subagent's turn end unchecked, and still checks the main conversation's", async () => {
    const root = await failing();
    // A subagent of `invoke_subagent`: its own conversation, with an empty `lastUserInput`.
    expect(await answer(stop(root, "sub", "NO_TOOL_CALL", true, ""))).toEqual({ decision: "stop" });
    expect(await answer(stop(root, "sub", "model_stop", true, ""))).toEqual({ decision: "stop" });
    expect(pending(root, "sub")).toBe(false);
    // The main conversation brings the person's text, or no such field in its editor.
    const main = await answer(stop(root, "c1", "NO_TOOL_CALL", true, "Reparte los cortes"));
    expect(main.decision).toBe("continue");
    expect(main.reason).toContain("FALLA todo");
    expect(pending(root, "c1")).toBe(true);
    expect((await answer(stop(root, "c2", "NO_TOOL_CALL"))).decision).toBe("continue");
  });

  it("is offered by check --install inside Specty's hook, once, and init keeps it (AC2)", async () => {
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    await cli(root, ["init", "--language", "es", "--tools", "antigravity"]);
    const plan = await cli(root, ["check", "--install", "--dry-run"]);
    expect(plan.out).toContain(`${HOOKS} (modificar)`);
    expect(plan.out).toContain("hook agent-stop antigravity");
    expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
    const specty = async () => JSON.parse(await read(root, HOOKS)).specty;
    const turn = (await specty()).Stop;
    expect(turn).toEqual([
      {
        type: "command",
        command: expect.stringContaining("hook agent-stop antigravity"),
        timeout: 600,
      },
    ]);
    expect((await specty()).PreToolUse).toHaveLength(1);
    expect((await cli(root, ["check", "--install", "--dry-run"])).out).not.toContain("agent-stop");
    await cli(root, ["init", "--language", "es", "--tools", "antigravity"]);
    expect((await specty()).Stop).toEqual(turn);
  });
});

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
const OTHER_SPEC = `.specty/changes/${OTHER}/spec.md`;

describe("a subagent that Antigravity launches with invoke_subagent (Workspace inherit)", () => {
  it("AC4: enters its slice's folder, the main conversation stays in its own, and its turn ends there unchecked", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    expect((await cli(root, ["new", "--worktree", "--subagent", "Otro cambio"])).code).toBe(0);
    const [first, second] = [folderOf(root), folderOf(root, OTHER)];
    await writeFiles(second, {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
    });
    // As agy 1.5.1 sends them: the subagent has a conversation of its own, the workspace of the
    // one that launched it and an empty `lastUserInput`.
    const event = (conversation: string, said: string, step: number, call: unknown) =>
      JSON.stringify({
        ...common(root, conversation),
        lastUserInput: said,
        toolCall: call,
        stepIdx: step,
      });
    const pre = (conversation: string, said: string, step: number, call: unknown) =>
      answer(
        cli(root, ["guard", "--tool", "antigravity", "--event", "PreToolUse"], {
          stdin: event(conversation, said, step, call),
        }),
      );
    const run = (line: string) => ({ name: "run_command", args: { CommandLine: line, Cwd: root } });
    const said = "Reparte los cortes de la épica";
    expect((await pre("main", said, 1, run(`specty enter ${CHANGE}`))).decision).toBe("allow");
    expect((await pre("sub", "", 1, run(`specty enter ${OTHER}`))).decision).toBe("allow");
    const write = {
      name: "write_file",
      args: { Path: join(second, OTHER_SPEC), Content: "# Plan del corte\n" },
    };
    expect((await pre("sub", "", 2, write)).decision).toBe("allow");
    const bound = async (conversation: string) =>
      JSON.parse(await read(root, `.git/common/specty/sessions/${conversation}.json`)).folder;
    expect(await bound("sub")).toBe(second);
    expect(await bound("main")).toBe(first);
    // `specty check --changed` fails in its folder, and its end of turn is not sent back.
    expect(await answer(stop(root, "sub", "NO_TOOL_CALL", true, ""))).toEqual({ decision: "stop" });
    expect(pending(second, "sub")).toBe(false);
    // The same end with the person's text would have been: the check runs in its folder.
    const checked = await answer(stop(root, "sub", "NO_TOOL_CALL", true, said));
    expect(checked.decision).toBe("continue");
    expect(pending(second, "sub")).toBe(true);
  });
});

describe("the task card in Antigravity", () => {
  it("comes with the first model call of each turn, before what waited for it (AC3)", async () => {
    const root = await implementing();
    const command = {
      toolCall: { name: "run_command", args: { CommandLine: "python3 gen.py", Cwd: root } },
      stepIdx: 3,
    };
    await answer(guard(root, "PreToolUse", command));
    await writeFiles(root, { "src/other.ts": "generated\n" });
    await answer(guard(root, "PostToolUse", command));
    const invocation = (index: number) =>
      guard(root, "PreInvocation", { invocationNum: index, initialNumSteps: 4 });
    const first = await answer(invocation(0));
    expect(first.injectSteps).toHaveLength(2);
    expect(first.injectSteps[0].ephemeralMessage).toContain("TAREA T1");
    expect(first.injectSteps[1].ephemeralMessage).toContain(
      "`src/other.ts` está fuera del alcance de T1.",
    );
    expect(await answer(invocation(1))).toEqual({});
    const again = await answer(invocation(0));
    expect(again.injectSteps).toHaveLength(1);
    expect(again.injectSteps[0].ephemeralMessage).toContain("TAREA T1");
  });
});

describe("Antigravity's terminal sandbox", () => {
  it("AC2: lets each command it allows write in git's common folder only", async () => {
    const root = await implementing();
    const run = (index: number, line: string) => ({
      toolCall: { name: "run_command", args: { CommandLine: line, Cwd: root } },
      stepIdx: index,
    });
    expect(await answer(guard(root, "PreToolUse", run(1, "pnpm test")))).toEqual({
      decision: "allow",
      permissionOverrides: [`write_file(${join(root, ".git")})`],
    });
    // Its file tools do not run in the terminal, and what it denies gets nothing.
    const write = {
      toolCall: { name: "write_to_file", args: { TargetFile: join(root, "src/app.ts") } },
      stepIdx: 2,
    };
    expect(await answer(guard(root, "PreToolUse", write))).toEqual({ decision: "allow" });
    const denied = await answer(guard(root, "PreToolUse", run(3, "specty approve")));
    expect(denied.decision).toBe("deny");
    expect(denied.permissionOverrides).toBeUndefined();
  });
});
