// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { consumptionOf } from "../src/agents";
import { type Run, reportMarkdown, summarize } from "../src/report";

/** An answer of Claude Code's `stream-json`, of its main thread or of a subagent's. */
const answer = (parent: string | null, read: number, written: number) =>
  JSON.stringify({
    type: "assistant",
    parent_tool_use_id: parent,
    message: {
      content: [],
      usage: {
        input_tokens: 5,
        cache_creation_input_tokens: written,
        cache_read_input_tokens: read,
        output_tokens: 300,
      },
    },
  });

/** A run with a subagent, which reads more than the main thread, in a context of its own. */
const STREAM = [
  '{"type":"system","subtype":"init","model":"claude"}',
  answer(null, 10_000, 20_000),
  answer("toolu_1", 90_000, 1000),
  answer(null, 30_000, 2000),
  JSON.stringify({ type: "result", subtype: "success", total_cost_usd: 1.2345, num_turns: 3 }),
].join("\n");

describe("the consumption of a run", () => {
  it("AC1: Claude Code's cost, and the largest context its main thread read, without its subagents", () => {
    expect(consumptionOf("claude-code", STREAM)).toEqual({ cost: 1.2345, context: 32_005 });
    // Without its result, or from another agent, nothing.
    const unfinished = STREAM.split("\n").slice(0, 3).join("\n");
    expect(consumptionOf("claude-code", unfinished)).toBeUndefined();
    expect(consumptionOf("codex", STREAM)).toBeUndefined();
  });

  it("AC1: the report adds the averages per agent and experiment, in a section of its own", () => {
    const run = (scenario: Run["scenario"], cost?: number, context?: number): Run => ({
      agent: "claude-code",
      scenario,
      verdict: { outcome: "followed" },
      blocks: 0,
      rounds: 10,
      ...(cost === undefined ? {} : { cost }),
      ...(context === undefined ? {} : { context }),
    });
    const runs = [
      run("changes", 3, 90_000),
      run("changes", 4, 110_000),
      run("changes-subagent", 3.5, 40_000),
      run("no-spec"),
    ];
    const summary = summarize(runs, []);
    expect(summary.usage).toEqual([
      { agent: "claude-code", scenario: "changes", runs: 2, cost: 3.5, context: 100_000 },
      { agent: "claude-code", scenario: "changes-subagent", runs: 1, cost: 3.5, context: 40_000 },
    ]);
    const markdown = reportMarkdown(summary, "2026-10-29");
    expect(markdown).toContain("## Consumo");
    expect(markdown).toContain(
      "| Agente | Escenario | Ejecuciones | Coste medio (USD) | Contexto máximo medio |",
    );
    expect(markdown).toContain("| Claude Code | changes | 2 | 3,50 | 100.000 |");
    expect(markdown).toContain("| Claude Code | changes-subagent | 1 | 3,50 | 40.000 |");
    // Without any consumption, no section.
    expect(reportMarkdown(summarize([run("no-spec")], []), "2026-10-29")).not.toContain(
      "## Consumo",
    );
  });
});
