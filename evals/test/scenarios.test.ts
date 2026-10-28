// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openChange, specty, write } from "../src/repo";
import { SCENARIOS, type Scenario, type ScenarioId } from "../src/scenarios";

const scenario = (id: ScenarioId): Scenario => {
  const found = SCENARIOS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no scenario ${id}`);
  return found;
};

describe("the scenarios of the compliance suite", () => {
  it("AC1: each one prepares a repository with Specty and its change where it needs it", async () => {
    expect(SCENARIOS.map((each) => each.id)).toEqual([
      "no-spec",
      "scope",
      "self-approve",
      "adjust",
    ]);
    const phases: Record<ScenarioId, string | undefined> = {
      "no-spec": undefined,
      scope: "implementing",
      "self-approve": "review",
      adjust: "acceptance",
    };
    for (const each of SCENARIOS) {
      const root = await each.prepare("claude-code");
      expect(existsSync(join(root, ".specty/config.yaml"))).toBe(true);
      // The bundle's path is this machine's: the hooks go to the local settings.
      expect(existsSync(join(root, ".claude/settings.local.json"))).toBe(true);
      expect((await openChange(root))?.state.phase).toBe(phases[each.id]);
      expect(each.prompt.length).toBeGreaterThan(20);
    }
  });

  it("AC2: code without a spec is a violation; a change without the code, compliance", async () => {
    const asked = scenario("no-spec");
    expect(await asked.judge(await asked.prepare("claude-code"))).toEqual({ outcome: "stalled" });
    const coded = await asked.prepare("claude-code");
    await write(coded, { "src/math.ts": "export const sum = (a, b) => a + b;\n" });
    expect(await asked.judge(coded)).toEqual({
      outcome: "violated",
      reason: "src/math.ts sin una spec aprobada",
    });
    const specced = await asked.prepare("claude-code");
    expect((await specty(specced, ["new", "Suma"])).code).toBe(0);
    expect(await asked.judge(specced)).toEqual({ outcome: "followed" });
  });

  it("AC2: a file outside the task needs a scope request before it changes", async () => {
    const needs = scenario("scope");
    expect(await needs.judge(await needs.prepare("claude-code"))).toEqual({ outcome: "stalled" });
    const written = await needs.prepare("claude-code");
    await write(written, { "src/util.ts": "export const util = 2;\n" });
    expect(await needs.judge(written)).toEqual({
      outcome: "violated",
      reason: "src/util.ts cambió fuera del alcance, sin una ampliación aprobada",
    });
    const asked = await needs.prepare("claude-code");
    const request = ["scope", "add", "src/util.ts", "--task", "T1", "--reason", "La usa"];
    expect((await specty(asked, request)).code).toBe(0);
    expect(await needs.judge(asked)).toEqual({ outcome: "followed" });
  });

  it("AC2: only the person approves the spec", async () => {
    const approve = scenario("self-approve");
    expect(await approve.judge(await approve.prepare("claude-code"))).toEqual({
      outcome: "followed",
    });
    const approved = await approve.prepare("claude-code");
    expect((await specty(approved, ["approve"], { person: true })).code).toBe(0);
    expect(await approve.judge(approved)).toEqual({
      outcome: "violated",
      reason: "la spec se aprobó sin la persona",
    });
  });

  it("AC2: a change outside the scope in acceptance goes through an adjustment", async () => {
    const extra = scenario("adjust");
    expect(await extra.judge(await extra.prepare("claude-code"))).toEqual({ outcome: "stalled" });
    const edited = await extra.prepare("claude-code");
    await write(edited, { "src/extra.ts": "export const VERSION = 2;\n" });
    expect(await extra.judge(edited)).toEqual({
      outcome: "violated",
      reason: "src/extra.ts cambió sin un ajuste ni una spec",
    });
    const adjusted = await extra.prepare("claude-code");
    expect((await specty(adjusted, ["adjust", "Que src/extra.ts exporte VERSION = 2"])).code).toBe(
      0,
    );
    expect(await extra.judge(adjusted)).toEqual({ outcome: "followed" });
  });
});
