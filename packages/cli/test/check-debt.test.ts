// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, git, person, tempRepo, writeFiles } from "./support";

/** A source with `count` lines of code. */
const source = (count: number): string =>
  `${Array.from({ length: count }, (_, index) => `export const v${index} = ${index};`).join("\n")}\n`;

const DEBT =
  "Deuda de `specty check --all`: la verificación `max-lines` tiene hallazgos en el repositorio. Para verlos, `specty check --all --verbose`; Specty marca esta entrada hecha cuando la verificación pasa.";
const ADDED = "Deuda anotada en la memoria como mejoras: P1.";

/** Outside CI, whatever the machine running the tests says: GitHub Actions sets `CI=true`. */
const LOCAL = { env: { CI: "" } };

/** A repository whose committed `src/big.ts` is past max-lines' maximum; `secrets` stays off. */
async function withDebt(): Promise<string> {
  return tempRepo({
    "src/app.ts": source(10),
    "src/big.ts": source(520),
    ".specty/config.yaml": `${CONFIG()}checks:\n  levels:\n    secrets: off\n`,
  });
}

describe("specty check --all keeps its debt in the memory", () => {
  it("AC1: adds an improvement for each check that fails, and says which entries it added", async () => {
    const root = await withDebt();
    const run = await cli(root, ["check", "--all"], LOCAL);
    expect(run.code).toBe(1);
    expect(run.out).toContain("  src/big.ts 520 líneas de código (máximo 500)");
    expect(run.out.split("\n").slice(-2)).toEqual(["OK 3/4 · FALLA: max-lines", ADDED]);
    const memory = (await cli(root, ["memory"])).out;
    // Without a terminal, whoever runs it is an agent, and Specty does not know which one.
    expect(memory).toContain(`P1 · mejora · ${DEBT} — agent, `);
    expect(memory).not.toContain("P2 ·");
  });

  it("AC2: does not add again the debt of a check while its entry is open", async () => {
    const root = await withDebt();
    expect((await cli(root, ["check", "--all"], LOCAL)).out).toContain(ADDED);
    const again = await cli(root, ["check", "--all"], LOCAL);
    expect(again.out.split("\n").at(-1)).toBe("OK 3/4 · FALLA: max-lines");
    const memory = (await cli(root, ["memory"])).out;
    expect(memory.split(DEBT)).toHaveLength(2);
    expect(memory).not.toContain("P2 ·");
  });

  it("AC2: does not bring back a debt the person dropped", async () => {
    const root = await withDebt();
    await cli(root, ["check", "--all"], LOCAL);
    const dropped = await cli(root, ["memory", "drop", "P1", "--reason", "Se queda así."], {
      terminal: person(),
    });
    expect(dropped.code).toBe(0);
    const again = await cli(root, ["check", "--all"], LOCAL);
    expect(again.out).not.toContain("Deuda anotada");
    expect((await cli(root, ["memory", "--all"])).out).not.toContain("P2 ·");
  });

  it("AC3: marks the entry done once a later run passes the check, and says so", async () => {
    const root = await withDebt();
    await cli(root, ["check", "--all"], LOCAL);
    await writeFiles(root, { "src/big.ts": source(20) });
    git(root, "commit", "-qam", "dividir", "--no-verify");
    const paid = await cli(root, ["check", "--all"], LOCAL);
    expect(paid.code).toBe(0);
    expect(paid.out.split("\n")).toEqual([
      "OK 4/4",
      "Deuda saldada, marcada hecha en la memoria: P1.",
    ]);
    expect((await cli(root, ["memory"])).out).not.toContain("P1 ·");
    expect((await cli(root, ["memory", "--all"])).out).toContain(`P1 · mejora · hecha · ${DEBT}`);
    expect((await cli(root, ["check", "--all"], LOCAL)).out).toBe("OK 4/4");
  });

  it("AC4: writes nothing in CI, nor with --changed", async () => {
    const root = await withDebt();
    const ci = await cli(root, ["check", "--all"], { env: { CI: "true" } });
    expect(ci.code).toBe(1);
    expect(ci.out.split("\n").at(-1)).toBe("OK 3/4 · FALLA: max-lines");
    await writeFiles(root, { "src/long.ts": source(520) });
    const changed = await cli(root, ["check"], LOCAL);
    expect(changed.code).toBe(1);
    expect(changed.out.split("\n").at(-1)).toBe("OK 3/4 · FALLA: max-lines");
    expect((await cli(root, ["memory"])).out).not.toContain("P1 ·");
    expect(git(root, "branch", "--list", "specty-memory")).toBe("");
  });
});
