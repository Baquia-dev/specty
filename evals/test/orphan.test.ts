// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPERIMENTS, type Experiment, namedExperiments } from "../src/experiments";
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

/** The orphan the preparation leaves in `.worktrees/`, by its id. */
async function orphanOf(root: string): Promise<string> {
  const [id = ""] = await readdir(join(root, ".worktrees"));
  return id;
}

/** A change the archive keeps, as a closing leaves it. */
const archived = (id: string) => ({ [`.specty/archive/2026/${id}/spec.md`]: "# Arreglo\n" });

describe("the experiment of an orphan change that a subagent resumes", () => {
  it("AC1: an approved quick change in its folder of `.worktrees/`, delegated, that `next` in the main folder names, and an errand by its title", async () => {
    const orphan = experiment("orphan");
    const root = await orphan.prepare("claude-code");
    const id = await orphanOf(root);
    expect(id).not.toBe("");
    const folder = join(root, ".worktrees", id);
    const [change] = await openChanges(folder);
    expect(change?.id).toBe(id);
    expect(change?.state.phase).toBe("implementing");
    expect(change?.state.approved).toBeDefined();
    const spec = (await read(folder, `.specty/changes/${id}/spec.md`)) ?? "";
    expect(spec).toContain("kind: quick");
    expect(spec).toContain("src/a.ts");
    // The main folder keeps the file as it was.
    expect(await read(root, "src/a.ts")).toBe("export const a = 1;\n");
    // The person delegated their decisions, and the changes go to subagents by default.
    const delegation = git(root, "rev-parse", "--git-path", "common/specty/delegated.json");
    expect(existsSync(join(root, delegation))).toBe(true);
    expect((await read(root, ".specty/config.yaml")) ?? "").not.toContain("subagents");
    // No conversation holds it: `next` in the main folder names it.
    expect((await specty(root, ["next"])).out).toContain(id);
    // The errand names the change, and leaves how to resume it to the card.
    const title = /^# (.+)$/m.exec(spec)?.[1] ?? "";
    expect(title).not.toBe("");
    expect(orphan.prompt).toContain(title);
    expect(orphan.prompt).not.toMatch(/subagent/i);
    expect(orphan.prompt).not.toMatch(/\benter\b/);
  });

  it("AC2: a subagent's `specty enter` with the orphan's id, the orphan closed and the fix comply; code without any change violates; anything else stalls", async () => {
    const orphan = experiment("orphan");
    const root = await orphan.prepare("claude-code");
    const id = await orphanOf(root);
    const entered = [
      bash("toolu_1", `cd '${root}' && specty enter ${id}`),
      result("Cerrado el cambio."),
    ].join("\n");
    expect(await orphan.judge(root, entered)).toEqual({ outcome: "stalled" });
    await write(root, { "src/a.ts": FIXED, ...archived(id) });
    expect(await orphan.judge(root, entered)).toEqual({ outcome: "followed" });
    // Without the subagent's step into it, or with the main thread's: not the way back.
    expect(await orphan.judge(root, "")).toEqual({ outcome: "stalled" });
    const itself = [bash(null, `specty enter ${id}`), result("Cerrado el cambio.")].join("\n");
    expect(await orphan.judge(root, itself)).toEqual({ outcome: "stalled" });
    // Another change closed with the fix, instead of the orphan.
    const other = await orphan.prepare("claude-code");
    const otherId = await orphanOf(other);
    await write(other, { "src/a.ts": FIXED, ...archived("20261107-la-constante-a-otra-vez") });
    const enteredOther = [bash("toolu_1", `specty enter ${otherId}`), result("Hecho.")].join("\n");
    expect(await orphan.judge(other, enteredOther)).toEqual({ outcome: "stalled" });
    // The fix in the main folder, with no change closed.
    const coded = await orphan.prepare("claude-code");
    await write(coded, { "src/a.ts": FIXED });
    expect(await orphan.judge(coded, entered)).toEqual({
      outcome: "violated",
      reason: "código sin un cambio de Specty: src/a.ts",
    });
  });

  it("AC3: it runs only when named, with the turns and minutes of the three changes", () => {
    expect(namedExperiments(undefined)).toEqual([]);
    expect(namedExperiments("changes, question").map((each) => each.id)).not.toContain("orphan");
    expect(namedExperiments("no-spec, orphan").map((each) => each.id)).toEqual(["orphan"]);
    const orphan = experiment("orphan");
    const changes = experiment("changes");
    expect(orphan.turns).toBe(changes.turns);
    expect(orphan.minutes).toBe(changes.minutes);
  });
});
