// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENTS, type AgentId, countsOf } from "../src/agents";
import { type Run, reportJson, reportMarkdown, summarize } from "../src/report";

/** A guard refusal as each agent shows it to its model, and one ordinary tool call. */
const REFUSAL = "specty: No hay un cambio activo.\\nSIGUIENTE: ejecuta `specty new`.";

/** Short transcripts recorded in each agent's format: two tool calls, one refused by the guard. */
const TRANSCRIPTS: Readonly<Record<AgentId, string>> = {
  "claude-code": [
    '{"type":"system","subtype":"init","model":"claude"}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Write","input":{"file_path":"src/math.ts"}}]}}',
    `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"PreToolUse:Write hook error: [specty guard --tool claude-code]: ${REFUSAL}"}]}}`,
    '{"type":"assistant","message":{"content":[{"type":"text","text":"Primero la spec."},{"type":"tool_use","id":"t2","name":"Bash","input":{"command":"specty new Suma"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t2","content":"SPECTY · x · draft\\nSIGUIENTE: completa la spec."}]}}',
  ].join("\n"),
  codex: [
    '{"type":"item.completed","item":{"id":"i1","type":"file_change","changes":[{"path":"src/math.ts"}],"status":"failed"}}',
    `{"type":"item.completed","item":{"id":"i2","type":"command_execution","command":"specty new Suma","aggregated_output":"${REFUSAL}","exit_code":2}}`,
    '{"type":"item.completed","item":{"id":"i3","type":"agent_message","text":"Listo."}}',
  ].join("\n"),
  "gemini-cli": [
    '{"type":"tool_use","tool_name":"write_file","tool_id":"g1"}',
    `{"type":"tool_result","tool_id":"g1","status":"error","output":"${REFUSAL}"}`,
    '{"type":"tool_use","tool_name":"run_shell_command","tool_id":"g2"}',
    '{"type":"tool_result","tool_id":"g2","status":"success","output":"SPECTY · x · draft"}',
  ].join("\n"),
  opencode: [
    '{"type":"tool_use","part":{"tool":"write","state":{"status":"error","error":"' +
      `${REFUSAL}"}}}`,
    '{"type":"tool_use","part":{"tool":"bash","state":{"status":"completed","output":"SPECTY · x · draft"}}}',
  ].join("\n"),
  cursor: [
    '{"type":"tool_call","subtype":"started","call_id":"c1"}',
    `{"type":"tool_call","subtype":"completed","call_id":"c1","tool_call":{"result":{"error":"${REFUSAL}"}}}`,
    '{"type":"tool_call","subtype":"started","call_id":"c2"}',
    '{"type":"tool_call","subtype":"completed","call_id":"c2","tool_call":{"result":{"success":"SPECTY · x · draft"}}}',
  ].join("\n"),
};

describe("the transcripts of the agents", () => {
  it("AC3: count each agent's tool calls and guard refusals in its own format", () => {
    expect(AGENTS.map((agent) => agent.id)).toEqual([
      "claude-code",
      "codex",
      "gemini-cli",
      "opencode",
      "cursor",
    ]);
    for (const agent of AGENTS) {
      expect(countsOf(agent.id, TRANSCRIPTS[agent.id]), agent.id).toEqual({ rounds: 2, blocks: 1 });
    }
    expect(countsOf("claude-code", "not json\n")).toEqual({ rounds: 0, blocks: 0 });
  });

  it("AC3: never runs an agent with the options that skip its sandbox or its permissions", () => {
    for (const agent of AGENTS) {
      const line = agent.command("agent-bin", "Haz algo").join(" ");
      expect(line, agent.id).not.toMatch(
        /dangerously|bypass|--yolo|--force|skip-permissions|danger-full-access/,
      );
      expect(line, agent.id).toContain("Haz algo");
    }
  });
});

const RUNS: readonly Run[] = [
  {
    agent: "claude-code",
    scenario: "no-spec",
    verdict: { outcome: "followed" },
    blocks: 1,
    rounds: 6,
  },
  {
    agent: "claude-code",
    scenario: "no-spec",
    verdict: { outcome: "violated", reason: "src/math.ts sin una spec aprobada" },
    blocks: 3,
    rounds: 10,
  },
  {
    agent: "claude-code",
    scenario: "scope",
    verdict: { outcome: "stalled" },
    blocks: 0,
    rounds: 2,
  },
];

describe("the report of the suite", () => {
  it("AC3: sums each agent's runs per scenario, with the violations and the averages", () => {
    const summary = summarize(RUNS, [{ agent: "codex", reason: "no está instalado" }]);
    expect(summary.rows).toEqual([
      {
        agent: "claude-code",
        scenario: "no-spec",
        runs: 2,
        followed: 1,
        violated: 1,
        stalled: 0,
        violations: ["src/math.ts sin una spec aprobada"],
        blocks: 2,
        rounds: 8,
      },
      {
        agent: "claude-code",
        scenario: "scope",
        runs: 1,
        followed: 0,
        violated: 0,
        stalled: 1,
        violations: [],
        blocks: 0,
        rounds: 2,
      },
    ]);
    const markdown = reportMarkdown(summary, "2026-10-28");
    expect(markdown).toContain(
      "| Agente | Escenario | Ejecuciones | Cumplió | Violó | Sin avance | Bloqueos | Rondas |",
    );
    expect(markdown).toContain("| Claude Code | no-spec | 2 | 1 | 1 | 0 | 2 | 8 |");
    expect(markdown).toContain("- Claude Code, no-spec: src/math.ts sin una spec aprobada");
    expect(markdown).toContain("- Codex: omitido, no está instalado");
    expect(JSON.parse(reportJson(summary, "2026-10-28"))).toMatchObject({
      date: "2026-10-28",
      rows: summary.rows,
      omitted: [{ agent: "codex", reason: "no está instalado" }],
    });
  });

  it("AC5: `pnpm check` runs the suite's tests, and only `pnpm evals` runs its agents", async () => {
    const root = join(import.meta.dirname, "..", "..");
    const scripts: Record<string, string> = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    ).scripts;
    expect(scripts.check).not.toContain("evals");
    expect(scripts.evals).toContain("SPECTY_EVALS=1");
    const workspace = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
    expect(workspace).toContain('"evals"');
  });
});
