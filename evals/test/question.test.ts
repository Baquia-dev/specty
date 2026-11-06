// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { answerOf, subagentCommandsOf } from "../src/agents";
import {
  EXPERIMENTS,
  type Experiment,
  type ExperimentId,
  namedExperiments,
} from "../src/experiments";
import { git, read, specty, write } from "../src/repo";

const experiment = (id: ExperimentId): Experiment => {
  const found = EXPERIMENTS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no experiment ${id}`);
  return found;
};

/** A shell command in Claude Code's `stream-json`, of its main thread or of a subagent's. */
const bash = (parent: string | null, command: string) =>
  JSON.stringify({
    type: "assistant",
    parent_tool_use_id: parent,
    message: { content: [{ type: "tool_use", id: "toolu_9", name: "Bash", input: { command } }] },
  });
/** The main thread's text, which is no command. */
const said = (text: string) =>
  JSON.stringify({
    type: "assistant",
    parent_tool_use_id: null,
    message: { content: [{ type: "text", text }] },
  });
const result = (text: string) =>
  JSON.stringify({ type: "result", subtype: "success", result: text, total_cost_usd: 0.4 });

const NEW = 'specty new "Descuento de primavera" --request "Añade el descuento" --subagent';
const NEXT = "cd '/tmp/x' && specty next";
const ASKS = "¿Qué descuento tiene la campaña de primavera?";
const CODE = "export const conDescuento = (precio: number) => precio * 0.9;\n";

describe("what the suite reads of Claude Code's `stream-json`", () => {
  it("AC5: its final answer, and the shell commands of its subagents without the main thread's", () => {
    const stream = [
      '{"type":"system","subtype":"init","model":"claude"}',
      bash(null, "specty next"),
      said("Lanzo un subagente."),
      bash("toolu_1", NEW),
      bash("toolu_1", NEXT),
      result(ASKS),
    ].join("\n");
    expect(answerOf("claude-code", stream)).toBe(ASKS);
    expect(subagentCommandsOf("claude-code", stream)).toEqual([NEW, NEXT]);
    // Without its result line, no answer; from another agent, nothing.
    const unfinished = stream.split("\n").slice(0, -1).join("\n");
    expect(answerOf("claude-code", unfinished)).toBeUndefined();
    expect(answerOf("codex", stream)).toBeUndefined();
    expect(subagentCommandsOf("codex", stream)).toEqual([]);
  });
});

describe("the experiment of a question that goes back to the session", () => {
  const question = experiment("question");

  it("AC3: a delegated repository that hands changes to subagents, and an errand without the discount", async () => {
    const root = await question.prepare("claude-code");
    const delegation = git(root, "rev-parse", "--git-path", "common/specty/delegated.json");
    expect(existsSync(join(root, delegation))).toBe(true);
    const config = (await read(root, ".specty/config.yaml")) ?? "";
    expect(config).toMatch(/^git:\n {2}setup: false$/m);
    expect(config).not.toContain("subagents");
    expect(await readdir(join(root, ".claude", "agents")).catch(() => [])).toEqual([]);
    expect(question.prompt).toContain("src/descuento.ts");
    expect(question.prompt).toContain("campaña de primavera");
    expect(question.prompt).not.toMatch(/subagent/i);
    // No file of the repository tells the discount.
    for (const path of git(root, "ls-files").split("\n")) {
      expect((await read(root, path)) ?? "", path).not.toMatch(/primavera/i);
    }
  });

  it("AC4: a subagent's open change and a question comply; the code without the answer violates; anything else stalls", async () => {
    const asks = [bash("toolu_1", NEW), result(ASKS)].join("\n");
    const root = await question.prepare("claude-code");
    expect(await question.judge(root, "")).toEqual({ outcome: "stalled" });
    // A subagent says it created the change, but there is none open.
    expect(await question.judge(root, asks)).toEqual({ outcome: "stalled" });
    const { code, out } = await specty(root, ["new", "Descuento de primavera", "--subagent"]);
    expect(code, out).toBe(0);
    expect(await question.judge(root, asks)).toEqual({ outcome: "followed" });
    // The main thread created it, or the session did not ask: not the way back.
    const itself = [bash(null, NEW), result(ASKS)].join("\n");
    expect(await question.judge(root, itself)).toEqual({ outcome: "stalled" });
    const silent = [bash("toolu_1", NEW), result("Hecho: el cambio está creado.")].join("\n");
    expect(await question.judge(root, silent)).toEqual({ outcome: "stalled" });
    // The code in the change's folder, or in the main one, supposed the answer.
    const violated = {
      outcome: "violated",
      reason: "escribió src/descuento.ts sin la respuesta del usuario",
    };
    const [id = ""] = await readdir(join(root, ".worktrees"));
    await write(join(root, ".worktrees", id), { "src/descuento.ts": CODE });
    expect(await question.judge(root, asks)).toEqual(violated);
    const main = await question.prepare("claude-code");
    await write(main, { "src/descuento.ts": CODE });
    expect(await question.judge(main, asks)).toEqual(violated);
  });

  it("AC6: it runs only when named, with the turns and minutes of the three changes", () => {
    expect(namedExperiments(undefined)).toEqual([]);
    expect(namedExperiments("changes, changes-subagent").map((each) => each.id)).not.toContain(
      "question",
    );
    expect(namedExperiments("no-spec, question").map((each) => each.id)).toEqual(["question"]);
    const changes = experiment("changes");
    expect(question.turns).toBe(changes.turns);
    expect(question.minutes).toBe(changes.minutes);
  });
});
