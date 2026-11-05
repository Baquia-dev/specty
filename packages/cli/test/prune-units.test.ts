// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, cli, NOW, tempRepo, writeFiles } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const RECORD = ".git/common/specty/verified";

/** `days` before NOW, as an ISO date. */
const before = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60_000).toISOString();

/** A record of the unit `unit`, which passed `days` before NOW. */
const passed = (unit: string, days: number) =>
  `${JSON.stringify({ unit, command: `pnpm test ${unit}`, at: before(days), ms: 1200 })}\n`;

describe("`specty prune` and the record of units", () => {
  it("AC1: removes the units recorded more than 30 days ago, keeps the recent ones and says how many it removed", async () => {
    const root = await tempRepo(APP);
    await writeFiles(root, {
      [`${RECORD}/aaa.json`]: passed("core", 31),
      [`${RECORD}/bbb.json`]: passed("cli", 400),
      [`${RECORD}/ccc.json`]: passed("ui", 29),
      [`${RECORD}/ddd.json`]: passed("core", 0),
      // Specty always writes `at`: a record without one is rubbish.
      [`${RECORD}/eee.json`]: `${JSON.stringify({ unit: "cli" })}\n`,
      // Half a write in progress, which is not a record yet.
      [`${RECORD}/fff.json.123.tmp`]: passed("ui", 400),
    });
    const pruned = await cli(root, ["prune"], CLAUDE);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain(
      "UNIDADES BORRADAS DEL REGISTRO:\n  Anotadas hace más de 30 días: 3.",
    );
    expect(pruned.out).not.toContain("No había nada que limpiar.");
    const left = (name: string) => existsSync(join(root, RECORD, name));
    expect(["aaa.json", "bbb.json", "eee.json"].map(left)).toEqual([false, false, false]);
    expect(["ccc.json", "ddd.json", "fff.json.123.tmp"].map(left)).toEqual([true, true, true]);
    const again = await cli(root, ["prune"], CLAUDE);
    expect(again.out).not.toContain("UNIDADES BORRADAS DEL REGISTRO");
  });

  it("AC1: says nothing of the record when it has no old units, or when there is none", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["prune"], CLAUDE)).out).toContain("No había nada que limpiar.");
    await writeFiles(root, { [`${RECORD}/aaa.json`]: passed("core", 2) });
    const pruned = await cli(root, ["prune"], CLAUDE);
    expect(pruned.out).not.toContain("UNIDADES BORRADAS DEL REGISTRO");
    expect(existsSync(join(root, RECORD, "aaa.json"))).toBe(true);
  });
});
