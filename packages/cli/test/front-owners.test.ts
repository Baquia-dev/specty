// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, cli, NOW, tempRepo, writeFiles } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const run = (cwd: string, ...args: string[]) => cli(cwd, args, CLAUDE);

/** Where the guard records who holds the front `name`. */
const HOLD = (name: string) => `.git/common/specty/fronts/${name}.json`;

/** `minutes` before NOW, as an ISO date. */
const before = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

/**
 * The conversation `s1` of Codex took front B `took` minutes before NOW, and its last step was
 * `stepped` minutes before NOW.
 */
async function heldByCodex(root: string, took: number, stepped = took): Promise<void> {
  await writeFiles(root, {
    [HOLD("B")]: JSON.stringify({
      front: "B",
      tool: "codex",
      conversation: "s1",
      at: before(took),
    }),
    ".git/common/specty/activity/codex-s1.json": JSON.stringify({
      tool: "codex",
      folder: root,
      first: before(took),
      last: before(stepped),
    }),
  });
}

/** A repository whose memory has front B with P2 and P1, in that order, and front UI. */
async function withFronts(): Promise<string> {
  const root = await tempRepo(APP);
  for (const text of ["Uno", "Dos"]) expect((await run(root, "memory", "add", text)).code).toBe(0);
  expect((await run(root, "front", "add", "B", "Guard.")).code).toBe(0);
  expect((await run(root, "front", "add", "ui", "Servidor y UI.")).code).toBe(0);
  expect((await run(root, "front", "assign", "B", "P2", "P1")).code).toBe(0);
  return root;
}

describe("who holds each front, from its commands", () => {
  it("AC5: front take without the guard records no owner and says nobody holds the front", async () => {
    const root = await withFronts();
    const taken = await run(root, "front", "take", "b");
    expect(taken.code).toBe(0);
    expect(taken.out).toContain(
      "Nadie lleva el frente B: solo el guard de Specty registra la conversación de un agente que lo toma.",
    );
    expect(taken.out).toContain(
      "FRENTE B:\n  Guard.\n  P2 · pendiente · Dos\n  P1 · pendiente · Uno",
    );
    expect(taken.out).toContain("crea el cambio de P2, la primera libre del frente");
    expect(taken.out).toContain("--resolves P2`.");
    expect(existsSync(join(root, HOLD("B")))).toBe(false);
  });

  it("AC5: front take says who holds the front when a conversation holds it", async () => {
    const root = await withFronts();
    await heldByCodex(root, 3);
    const taken = await run(root, "front", "take", "B");
    expect(taken.code).toBe(0);
    expect(taken.out).toContain("FRENTE B:\n  Guard. · lo lleva codex, hace 3 min\n");
    expect(taken.out).not.toContain("Nadie lleva el frente B");
  });

  it("AC5: front take and front free of a front that does not exist write nothing and say so", async () => {
    const root = await withFronts();
    const take = await run(root, "front", "take", "Z");
    expect(take.code).toBe(1);
    expect(take.out).toContain("No hay ningún frente «Z».");
    const free = await run(root, "front", "free", "Z");
    expect(free.code).toBe(1);
    expect(free.out).toContain("No hay ningún frente «Z».");
    expect(existsSync(join(root, HOLD("Z")))).toBe(false);
  });

  it("AC4: front names the live owner of each front, and no owner past memory.orphanAfterMin", async () => {
    const root = await withFronts();
    await heldByCodex(root, 3);
    const list = (await cli(root, ["front"])).out;
    expect(list).toContain("FRENTE B:\n  Guard. · lo lleva codex, hace 3 min\n");
    expect(list).toContain("FRENTE UI:\n  Servidor y UI.\n");
    // It took the front long ago, but its conversation stepped lately: it still holds it.
    await heldByCodex(root, 90, 2);
    expect((await cli(root, ["front"])).out).toContain("  Guard. · lo lleva codex, hace 2 min\n");
    await heldByCodex(root, 61);
    expect((await cli(root, ["front"])).out).toContain("FRENTE B:\n  Guard.\n");
  });

  it("AC3: front free leaves the front without owner and says who held it", async () => {
    const root = await withFronts();
    await heldByCodex(root, 3);
    const freed = await run(root, "front", "free", "b");
    expect(freed.code).toBe(0);
    expect(freed.out).toContain("El frente B queda libre (lo llevaba codex, hace 3 min).");
    expect(existsSync(join(root, HOLD("B")))).toBe(false);
    expect((await cli(root, ["front"])).out).toContain("FRENTE B:\n  Guard.\n");
    const again = await run(root, "front", "free", "B");
    expect(again.code).toBe(0);
    expect(again.out).toContain("El frente B queda libre; nadie lo llevaba.");
  });
});
