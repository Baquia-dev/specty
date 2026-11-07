// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPERIMENTS, type Experiment, namedExperiments } from "../src/experiments";
import { decisionOf, person } from "../src/person";
import { git, openChanges, read, specty, write } from "../src/repo";

const experiment = (id: string): Experiment => {
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
const result = (text: string) =>
  JSON.stringify({ type: "result", subtype: "success", result: text, total_cost_usd: 0.4 });

const FIXED = "export const a = 2;\n";
const QUICK = `---
kind: quick
---

# La constante a vale 2

## Objetivo

La constante a vale 2.

## Archivos

- modificar src/a.ts — el valor

## Tareas

- [ ] T1: La constante a vale 2
  - files: src/a.ts
  - type: fix
`;

describe("the experiment of a person who decides while the agent waits", () => {
  it("AC1: a repository without delegated mode, that hands changes to subagents, a person who decides, and an errand of one fix", async () => {
    const wait = experiment("wait");
    expect(wait.person).toBe(true);
    for (const other of EXPERIMENTS.filter((each) => each.id !== "wait")) {
      expect(other.person, other.id).toBeUndefined();
    }
    const root = await wait.prepare("claude-code");
    const delegation = git(root, "rev-parse", "--git-path", "common/specty/delegated.json");
    expect(existsSync(join(root, delegation))).toBe(false);
    const config = (await read(root, ".specty/config.yaml")) ?? "";
    expect(config).toMatch(/^git:\n {2}setup: false$/m);
    expect(config).not.toContain("subagents");
    expect(wait.prompt).toContain("src/a.ts");
    expect(wait.prompt).not.toMatch(/src\/[bc]\.ts/);
    expect(wait.prompt).not.toMatch(/subagent|delegad|specty wait/i);
  });

  it("AC2: the person approves, accepts and closes, from the main folder, what has waited for them, and nothing else", async () => {
    const root = await experiment("wait").prepare("claude-code");
    const at = person(root, 1000);
    expect(await at.look(0)).toEqual([]);
    const created = await specty(root, [
      "new",
      "La constante a vale 2",
      "--kind",
      "quick",
      "--subagent",
    ]);
    expect(created.code, created.out).toBe(0);
    const [id = ""] = await readdir(join(root, ".worktrees"));
    const folder = join(root, ".worktrees", id);
    await write(folder, { [`.specty/changes/${id}/spec.md`]: QUICK });
    expect((await specty(folder, ["propose"])).code).toBe(0);
    // Not yet: it has waited for them less than the delay.
    expect(await at.look(1)).toEqual([]);
    expect(await at.look(1001)).toEqual([["approve", id]]);
    expect((await openChanges(folder))[0]?.state.phase).toBe("implementing");
    await write(folder, { "src/a.ts": FIXED });
    const done = await specty(folder, ["task", "done", "T1", "--summary", "a vale 2"]);
    expect(done.code, done.out).toBe(0);
    // Each step waits the delay again, from the look that first saw it.
    expect(await at.look(2000)).toEqual([]);
    expect(await at.look(3000)).toEqual([["accept", id]]);
    // Whatever else waits for them (a closing), they decide it too, until it is closed.
    for (const now of [4000, 5000, 6000, 7000]) await at.look(now);
    expect(await read(root, "src/a.ts")).toBe(FIXED);
    expect(existsSync(join(root, ".specty", "archive", id.slice(0, 4), id, "spec.md"))).toBe(true);
    expect(await at.look(8000)).toEqual([]);
  });

  it("AC2: each phase that waits for the person has its decision", () => {
    const change = { id: "x", waitingFor: "human", pendingScope: [] };
    expect(decisionOf({ ...change, phase: "review" })).toEqual(["approve", "x"]);
    expect(decisionOf({ ...change, phase: "testing" })).toEqual(["approve", "x"]);
    expect(decisionOf({ ...change, phase: "acceptance" })).toEqual(["accept", "x"]);
    expect(decisionOf({ ...change, phase: "closing" })).toEqual(["close", "x"]);
    expect(decisionOf({ ...change, phase: "implementing", pendingScope: ["S1"] })).toEqual([
      "approve",
      "x",
      "--scope",
      "S1",
    ]);
    expect(decisionOf({ ...change, phase: "draft" })).toBeUndefined();
  });

  it("AC3: a subagent's `specty wait`, a closed change and the fix comply; code without any change violates; anything else stalls", async () => {
    const wait = experiment("wait");
    const root = await wait.prepare("claude-code");
    const waited = [
      bash("toolu_1", `cd '${root}/.worktrees/x' && specty wait --timeout 3600`),
      result("Cerrado el cambio."),
    ].join("\n");
    expect(await wait.judge(root, waited)).toEqual({ outcome: "stalled" });
    await write(root, {
      "src/a.ts": FIXED,
      ".specty/archive/2026/20261107-la-constante-a-vale-2/spec.md": "# Arreglo\n",
    });
    expect(await wait.judge(root, waited)).toEqual({ outcome: "followed" });
    // Nobody waited, or only the main thread did.
    expect(await wait.judge(root, result("Cerrado el cambio."))).toEqual({ outcome: "stalled" });
    const itself = [bash(null, "specty wait"), result("Cerrado el cambio.")].join("\n");
    expect(await wait.judge(root, itself)).toEqual({ outcome: "stalled" });
    // The fix in the main folder, with no change closed.
    const coded = await wait.prepare("claude-code");
    await write(coded, { "src/a.ts": FIXED });
    expect(await wait.judge(coded, waited)).toEqual({
      outcome: "violated",
      reason: "código sin un cambio de Specty: src/a.ts",
    });
  });

  it("AC5: it runs only when named, with the turns and minutes of the three changes", () => {
    expect(namedExperiments(undefined)).toEqual([]);
    expect(namedExperiments("changes, orphan").map((each) => each.id)).not.toContain("wait");
    expect(namedExperiments("no-spec, wait").map((each) => each.id)).toEqual(["wait"]);
    const wait = experiment("wait");
    const changes = experiment("changes");
    expect(wait.turns).toBe(changes.turns);
    expect(wait.minutes).toBe(changes.minutes);
  });
});
