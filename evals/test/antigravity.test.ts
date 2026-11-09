// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENTS, type Agent, agentName, countsOf, invocation } from "../src/agents";

const antigravity = (): Agent => {
  const found = AGENTS.find((agent) => agent.id === "antigravity");
  if (found === undefined) throw new Error("no Antigravity CLI");
  return found;
};

/** A tool step of agy's `stream-json`, when it starts (`ACTIVE`) or ends (`DONE`, `ERROR`). */
const step = (
  conversation: string,
  index: number,
  state: string,
  tool: string,
  info: Readonly<Record<string, unknown>> = {},
) =>
  JSON.stringify({
    event: "step_update",
    step_update: {
      conversation_id: conversation,
      step_index: index,
      state,
      step_type: "tool",
      tool_name: tool,
      tool_info: { name: tool, ...info },
    },
  });

const DENIAL =
  "tool call denied by pre-tool hook: specty: No hay un cambio activo y `src/app.ts` es código gobernado: primero va la spec.\nSIGUIENTE: ejecuta `specty next`.";

/**
 * A run of `agy -p` as agy 1.5.1 writes it: the guard refuses an edit, `specty` fails in the
 * sandbox, agy does not let `git add` leave it, a subagent writes a file with the same step index
 * as one of the main conversation's, a last call never ends, and the final answer quotes the
 * refusal.
 */
const STREAM = [
  JSON.stringify({ event: "init", conversation_id: "c1", init: { model: "gemini" } }),
  JSON.stringify({
    event: "step_update",
    step_update: { conversation_id: "c1", step_index: 0, state: "DONE", step_type: "user_input" },
  }),
  step("c1", 2, "ACTIVE", "edit_file", { parameters: { Path: "src/app.ts" } }),
  step("c1", 2, "ERROR", "edit_file", {
    parameters: { Path: "src/app.ts" },
    error: { type: "TOOL_ERROR", message: DENIAL },
  }),
  step("c1", 4, "ACTIVE", "run_command", { parameters: { CommandLine: "specty next" } }),
  step("c1", 4, "DONE", "run_command", {
    parameters: { CommandLine: "specty next" },
    output:
      "Command exited with code 127.\n\nCommand output:\nzsh:1: operation not permitted: specty\r\n",
  }),
  step("c1", 6, "ACTIVE", "run_command", { parameters: { CommandLine: "git add -A" } }),
  step("c1", 6, "ERROR", "run_command", {
    parameters: { CommandLine: "git add -A" },
    error: {
      type: "TOOL_ERROR",
      message:
        'permission check failed for unsandboxed "git add -A": user denied permission to run command',
    },
  }),
  step("c2", 2, "ACTIVE", "write_file", { parameters: { Path: "notes.md" } }),
  step("c2", 2, "DONE", "write_file", { parameters: { Path: "notes.md" } }),
  step("c1", 8, "ACTIVE", "invoke_subagent"),
  "not json",
  JSON.stringify({
    event: "result",
    result: {
      conversation_id: "c1",
      status: "SUCCESS",
      response:
        "La edición fue denegada:\n> specty: No hay un cambio activo.\n> SIGUIENTE: ejecuta `specty next`.",
    },
  }),
].join("\n");

describe("Antigravity CLI in the compliance suite", () => {
  it("AC1: is one of the suite's agents, after Cursor CLI, found in SPECTY_EVALS_ANTIGRAVITY or as agy on the PATH", async () => {
    expect(AGENTS.map((agent) => agent.id).slice(-2)).toEqual(["cursor", "antigravity"]);
    expect(agentName("antigravity")).toBe("Antigravity CLI");
    const agent = antigravity();
    // A plain file, which could not run: finding it runs nothing.
    const folder = await mkdtemp(join(tmpdir(), "specty-evals-path-"));
    await writeFile(join(folder, "agy"), "not a binary\n");
    const empty = await mkdtemp(join(tmpdir(), "specty-evals-empty-"));
    expect(agent.find({ PATH: [empty, folder].join(delimiter) })).toBe(join(folder, "agy"));
    expect(agent.find({ SPECTY_EVALS_ANTIGRAVITY: "/opt/agy/bin/agy", PATH: folder })).toBe(
      "/opt/agy/bin/agy",
    );
    expect(agent.find({ PATH: empty })).toBeUndefined();
    expect(agent.find({})).toBeUndefined();
  });

  it("AC2: runs agy in print mode, in its sandbox, with the session's settings and the repository trusted", () => {
    const agent = antigravity();
    const line = agent.command("agy", "Haz algo", 30, "/tmp/repo");
    expect(line.slice(0, -1)).toEqual([
      "agy",
      "-p",
      "Haz algo",
      "--mode",
      "accept-edits",
      "--sandbox",
      "--output-format",
      "stream-json",
      "--settings",
    ]);
    expect(JSON.parse(line.at(-1) ?? "")).toEqual({
      toolPermission: "proceed-in-sandbox",
      permissions: { allow: ["command(specty)"] },
      trustedWorkspaces: ["/tmp/repo"],
    });
    // Without a folder, nothing is trusted.
    expect(JSON.parse(agent.command("agy", "Haz algo").at(-1) ?? "")).toEqual({
      toolPermission: "proceed-in-sandbox",
      permissions: { allow: ["command(specty)"] },
    });
    // Nothing skips its sandbox or its permissions, and the prompt goes as it is.
    expect(line.join(" ")).not.toMatch(/dangerously|bypass|skip-permissions|--yolo|--force/i);
    expect(line.filter((part) => part.includes("Haz algo"))).toEqual(["Haz algo"]);
    expect(agent.conversation).toBeUndefined();
    // The suite gives it the repository's folder, with or without a person who decides.
    for (const person of [false, true]) {
      expect(
        invocation(agent, "agy", "Haz algo", { turns: 30, person, folder: "/tmp/repo" }),
      ).toEqual({ command: line });
    }
    // The other agents ignore the folder.
    for (const other of AGENTS.filter((each) => each.id !== "antigravity")) {
      expect(other.command("bin", "Haz algo", 30, "/tmp/repo"), other.id).toEqual(
        other.command("bin", "Haz algo", 30),
      );
    }
  });

  it("AC3: counts each tool step once as a round, and only the guard's refusals as blocks", () => {
    expect(countsOf("antigravity", STREAM)).toEqual({ rounds: 5, blocks: 1 });
    expect(countsOf("antigravity", "")).toEqual({ rounds: 0, blocks: 0 });
  });
});
