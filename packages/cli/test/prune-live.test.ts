// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, NOW, tempRepo, writeFiles } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const ACTIVITY = ".git/common/specty/activity";
const MESSAGES = ".git/common/specty/messages";

/** `minutes` before NOW, as an ISO date. */
const before = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

/** An activity record whose last step, in `folder`, was `minutes` before NOW. */
const record = (folder: string, minutes: number) =>
  JSON.stringify({ tool: "claude-code", folder, first: before(minutes), last: before(minutes) });

describe("`specty prune` and the memory's live half", () => {
  it("AC1: removes the activity of folders that are gone and of old steps outside open changes", async () => {
    const root = await tempRepo(APP);
    // SPEC's change stays open in this same folder.
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(root, {
      [`${ACTIVITY}/claude-code-gone.json`]: record(join(root, "no-existe"), 1),
      [`${ACTIVITY}/claude-code-old.json`]: record(join(root, "src"), 61),
      [`${ACTIVITY}/claude-code-bench.json`]: record(join(root, "src"), 6000),
      [`${ACTIVITY}/claude-code-fresh.json`]: record(join(root, "src"), 10),
      [`${ACTIVITY}/claude-code-held.json`]: record(root, 120),
    });
    const pruned = await cli(root, ["prune"], CLAUDE);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain(
      "ACTIVIDAD BORRADA:\n  Registros de conversaciones que ya no trabajan: 3.",
    );
    const left = (name: string) => existsSync(join(root, ACTIVITY, `claude-code-${name}.json`));
    expect(["gone", "old", "bench"].map(left)).toEqual([false, false, false]);
    expect(["fresh", "held"].map(left)).toEqual([true, true]);
    expect((await cli(root, ["prune"], CLAUDE)).out).not.toContain("ACTIVIDAD BORRADA");
  });

  it("AC2: removes the messages of a change that is no longer open, and keeps the open one's", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    expect((await cli(root, ["message", CHANGE, "Mira lock.ts."], CLAUDE)).code).toBe(0);
    await writeFiles(root, {
      [`${MESSAGES}/20261101-viejo/20261101T100000-1.json`]: JSON.stringify({ text: "x" }),
    });
    const pruned = await cli(root, ["prune"], CLAUDE);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain("MENSAJES BORRADOS:\n  20261101-viejo\n");
    expect(existsSync(join(root, MESSAGES, "20261101-viejo"))).toBe(false);
    expect(existsSync(join(root, MESSAGES, CHANGE))).toBe(true);
  });
});
