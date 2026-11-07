// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { AGENTS, type Agent, invocation } from "../src/agents";

const claude = (): Agent => {
  const found = AGENTS.find((agent) => agent.id === "claude-code");
  if (found === undefined) throw new Error("no Claude Code");
  return found;
};

/** Lines of Claude Code's `stream-json`: the background tasks that run, and its main thread. */
const tasks = (...ids: string[]) =>
  JSON.stringify({
    type: "system",
    subtype: "background_tasks_changed",
    tasks: ids.map((id) => ({ task_id: id })),
  });
const INIT = JSON.stringify({ type: "system", subtype: "init" });
const ANSWER = JSON.stringify({
  type: "assistant",
  parent_tool_use_id: null,
  message: { content: [{ type: "text", text: "Fin." }] },
});
const RESULT = JSON.stringify({
  type: "result",
  subtype: "success",
  result: "Fin.",
  total_cost_usd: 0.1,
});

describe("Claude Code's conversation, kept open while a person decides", () => {
  it("AC2: its command line is the usual one, with its input in stream-json instead of the prompt", () => {
    const agent = claude();
    const command = agent.conversation?.("claude", "Haz algo", 150).command ?? [];
    const at = command.indexOf("--input-format");
    expect(at).toBeGreaterThan(0);
    expect(command[at + 1]).toBe("stream-json");
    const rest = command.filter((_, index) => index !== at && index !== at + 1);
    const usual = agent.command("claude", "Haz algo", 150).filter((arg) => arg !== "Haz algo");
    expect(rest).toEqual(usual);
    const line = command.join(" ");
    expect(line).not.toContain("Haz algo");
    expect(line).not.toMatch(/dangerously|bypass|skip-permissions/);
  });

  it("AC2: its input is one JSON line with the prompt as the user's message", () => {
    const input = claude().conversation?.("claude", "Haz algo", 150).session.input ?? "";
    expect(input.endsWith("\n")).toBe(true);
    expect(input.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(input)).toMatchObject({
      type: "user",
      message: { role: "user", content: "Haz algo" },
    });
  });

  it("AC2: its session ends with a result of the main thread once no background task runs, and not before", () => {
    const session = claude().conversation?.("claude", "Haz algo", 150).session;
    expect(session).toBeDefined();
    const done = (line: string) => session?.done(line);
    // The main thread hands the change to a subagent, which runs in the background, and answers.
    expect(done(INIT)).toBe(false);
    expect(done(tasks("agente"))).toBe(false);
    expect(done(ANSWER)).toBe(false);
    expect(done(RESULT)).toBe(false);
    // The subagent leaves `specty wait` in the background and ends; the main thread answers again.
    expect(done(tasks("espera"))).toBe(false);
    expect(done(RESULT)).toBe(false);
    // The wait ends: the list empties before the subagent resumes, with no result in between.
    expect(done(tasks())).toBe(false);
    expect(done(tasks("agente"))).toBe(false);
    expect(done(tasks())).toBe(false);
    expect(done("not json")).toBe(false);
    // The main thread answers with nothing left in the background.
    expect(done(RESULT)).toBe(true);
  });

  it("AC2: a session with nothing in the background ends with its first result", () => {
    const session = claude().conversation?.("claude", "Haz algo", 150).session;
    expect(session?.done(INIT)).toBe(false);
    expect(session?.done(ANSWER)).toBe(false);
    expect(session?.done(RESULT)).toBe(true);
  });

  it("AC2: the other agents have no conversation", () => {
    for (const agent of AGENTS.filter((each) => each.id !== "claude-code")) {
      expect(agent.conversation, agent.id).toBeUndefined();
    }
  });
});

describe("the run the suite puts together for an agent", () => {
  it("AC3: with a person who decides, Claude Code runs its conversation", () => {
    const agent = claude();
    const run = invocation(agent, "claude", "Haz algo", { turns: 150, person: true });
    expect(run.command).toEqual(agent.conversation?.("claude", "Haz algo", 150).command);
    expect(run.session?.input).toContain("Haz algo");
  });

  it("AC3: without a person, or for an agent without a conversation, it runs the usual command line with the prompt and no session", () => {
    for (const agent of AGENTS) {
      const run = invocation(agent, "bin", "Haz algo", { turns: 150, person: false });
      expect(run, agent.id).toEqual({ command: agent.command("bin", "Haz algo", 150) });
      expect(run.session, agent.id).toBeUndefined();
    }
    for (const agent of AGENTS.filter((each) => each.id !== "claude-code")) {
      const run = invocation(agent, "bin", "Haz algo", { turns: 150, person: true });
      expect(run, agent.id).toEqual({ command: agent.command("bin", "Haz algo", 150) });
      expect(run.session, agent.id).toBeUndefined();
    }
  });
});
