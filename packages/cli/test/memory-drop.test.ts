// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, person, tempRepo } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

/** A repository whose memory has the pending items «Uno» and «Dos». */
async function withTwo(): Promise<string> {
  const root = await tempRepo(APP);
  for (const text of ["Uno", "Dos"]) {
    expect((await cli(root, ["memory", "add", text], CLAUDE)).code).toBe(0);
  }
  return root;
}

const drop = (root: string, ...args: string[]) => cli(root, ["memory", "drop", ...args], CLAUDE);
const asPerson = (root: string, ...args: string[]) =>
  cli(root, ["memory", "drop", ...args], { terminal: person() });

describe("specty memory drop", () => {
  it("AC1: drops the entry when the person runs it from their terminal", async () => {
    const root = await withTwo();
    const dropped = await asPerson(root, "P1", "--reason", "Ya no aplica.");
    expect(dropped.code).toBe(0);
    expect(dropped.out).toContain("P1 descartada: Ya no aplica.");
    expect((await cli(root, ["memory"])).out).not.toContain("P1 ·");
    expect((await cli(root, ["memory", "--all"])).out).toContain(
      "P1 · pendiente · descartada · Uno",
    );
  });

  it("AC2: only proposes it when an agent runs it, in delegated mode too", async () => {
    const root = await withTwo();
    const asked = await drop(root, "P1", "--reason", "Duplica P2.");
    expect(asked.code).toBe(0);
    expect(asked.out).toContain("P1 queda propuesta para descartar: Duplica P2.");
    expect((await cli(root, ["memory"])).out).toContain(
      "P1 · pendiente · propuesta para descartar · Uno",
    );
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    expect((await drop(root, "P2", "--reason", "Ya está hecho.")).out).toContain(
      "P2 queda propuesta para descartar: Ya está hecho.",
    );
    expect((await cli(root, ["memory"])).out).toContain(
      "P2 · pendiente · propuesta para descartar · Dos",
    );
  });

  it("AC3: shows the proposals in status's «TE TOCA», and keep opens the entry again", async () => {
    const root = await withTwo();
    expect((await drop(root, "P1", "--reason", "Duplica P2.")).code).toBe(0);
    expect((await cli(root, ["status"])).out).toContain(
      "TE TOCA:\n  P1 · propuesta para descartar por claude-code: Duplica P2.\n",
    );
    const kept = await cli(root, ["memory", "keep", "P1"], CLAUDE);
    expect(kept.out).toContain("P1 sigue abierta.");
    expect((await cli(root, ["memory"])).out).toContain("P1 · pendiente · Uno");
    expect((await cli(root, ["status"])).out).not.toContain("TE TOCA");
  });

  it("AC3: lets the person drop a proposed entry with the proposal's reason", async () => {
    const root = await withTwo();
    expect((await drop(root, "P1", "--reason", "Duplica P2.")).code).toBe(0);
    expect((await asPerson(root, "P1")).out).toContain("P1 descartada: Duplica P2.");
    expect((await cli(root, ["status"])).out).not.toContain("TE TOCA");
  });

  it("AC4: changes nothing for an unknown, closed or taken entry, or without a reason", async () => {
    const root = await withTwo();
    expect((await asPerson(root, "P2", "--reason", "Ya no aplica.")).code).toBe(0);
    const created = await cli(root, [
      "new",
      "--worktree",
      "Saludo personalizado",
      "--resolves",
      "P1",
    ]);
    expect(created.code).toBe(0);
    const cases = [
      [["P9", "--reason", "x"], "La memoria no tiene la entrada P9."],
      [["P2", "--reason", "x"], "P2 ya está descartada."],
      [["P1", "--reason", "x"], `P1 la tomó el cambio ${CHANGE}`],
      [["P1"], 'Falta el motivo: `--reason "<motivo>"`.'],
    ] as const;
    for (const [args, why] of cases) {
      const refused = await asPerson(root, ...args);
      expect(refused.code).not.toBe(0);
      expect(refused.out).toContain(why);
    }
    expect((await cli(root, ["memory"])).out).toContain(
      `P1 · pendiente · tomada por ${CHANGE} · Uno`,
    );
    const notProposed = await cli(root, ["memory", "keep", "P1"], CLAUDE);
    expect(notProposed.code).not.toBe(0);
    expect(notProposed.out).toContain("P1 no está propuesta para descartar.");
  });
});
