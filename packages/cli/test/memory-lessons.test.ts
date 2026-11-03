// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, NOW, tempRepo } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (cwd: string, ...args: string[]) => cli(cwd, ["memory", "add", ...args], CLAUDE);

const DAY = NOW.toISOString().slice(0, 10);

describe("lessons and paths with specty memory add", () => {
  it("AC1: adds a lesson with its paths", async () => {
    const root = await tempRepo(APP);
    const added = await add(
      root,
      "El hilo principal solo importa de core/light.",
      "--kind",
      "lesson",
      "--path",
      "packages/ui/src/**",
      "packages/ui/src/main.ts",
    );
    expect(added.code).toBe(0);
    expect((await cli(root, ["memory"])).out).toContain(
      `P1 · lección · El hilo principal solo importa de core/light. — claude-code, ${DAY} · en packages/ui/src/**, packages/ui/src/main.ts`,
    );
  });

  it("AC1: refuses a lesson without paths", async () => {
    const root = await tempRepo(APP);
    const refused = await add(root, "Sin rutas", "--kind", "lesson");
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(
      "Una lección lleva las rutas a las que se refiere, y falta `--path`.",
    );
    expect((await cli(root, ["memory"])).out).not.toContain("Sin rutas");
  });

  it("AC2: keeps the paths of a decision, once each", async () => {
    const root = await tempRepo(APP);
    const decided = await add(
      root,
      "La documentación va en español.",
      "--kind",
      "decision",
      "--quote",
      "sí",
      "--path",
      "docs/**",
      "docs/**",
      "AGENTS.md",
    );
    expect(decided.code).toBe(0);
    expect((await cli(root, ["memory"])).out).toContain(
      `D1 · decisión · La documentación va en español. «sí» — claude-code, ${DAY} · en docs/**, AGENTS.md`,
    );
  });
});
