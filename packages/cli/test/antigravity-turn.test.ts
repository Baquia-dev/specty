// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, person, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

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

/** Its end of turn, as `Stop` sends it. */
const stop = (root: string, conversation: string, terminationReason = "model_stop") =>
  cli(root, ["hook", "agent-stop", "antigravity"], {
    stdin: JSON.stringify({
      ...common(root, conversation),
      executionNum: 0,
      terminationReason,
      fullyIdle: true,
    }),
  });

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
