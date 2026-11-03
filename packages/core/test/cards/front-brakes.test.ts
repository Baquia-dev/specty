// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type FrontOwner,
  foreignFrontsBlock,
  frontResolvesDenial,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const OWNER: FrontOwner = { front: "B", tool: "claude-code", ago: 3 };

describe("the brakes of the fronts", () => {
  it("AC1: says whose front the entry is, who holds it and since when, and what to do instead", () => {
    expect(frontResolvesDenial(OWNER, "P12", "es", "specty")).toEqual({
      reason:
        "P12 es del frente B, que ya tiene dueño: lo lleva claude-code, hace 3 min, en otra conversación.",
      next: "toma una entrada libre de tu frente o sin frente (`specty front` los lista), o pídele a la persona que libere el frente B en su terminal con `specty front free B`.",
    });
    expect(frontResolvesDenial(OWNER, "P12", "en", "specty")).toEqual({
      reason:
        "P12 belongs to front B, which already has an owner: held by claude-code, 3 min ago, in another conversation.",
      next: "take a free entry of your front or of none (`specty front` lists them), or ask the person to free front B in their terminal with `specty front free B`.",
    });
  });

  it("AC3: lists each front of another session with the spec's files that fall in it", () => {
    const touched = [
      { owner: OWNER, paths: ["src/a.ts", "src/b.ts"] },
      { owner: { front: "ui", tool: "codex", ago: 0 }, paths: ["ui/page.ts"] },
    ];
    expect(foreignFrontsBlock(touched, ES)).toEqual([
      {
        title: "FRENTES DE OTRAS SESIONES",
        lines: [
          "B · lo lleva claude-code, hace 3 min: src/a.ts, src/b.ts",
          "ui · lo lleva codex, ahora mismo: ui/page.ts",
          "Estos archivos caen en las rutas de un frente que lleva otra sesión (si no es el tuyo): no frena nada, pero coméntaselo al usuario antes de seguir.",
        ],
      },
    ]);
    expect(foreignFrontsBlock(touched.slice(0, 1), EN)).toEqual([
      {
        title: "OTHER SESSIONS' FRONTS",
        lines: [
          "B · held by claude-code, 3 min ago: src/a.ts, src/b.ts",
          "These files fall in the paths of a front another session holds (if it is not yours): it stops nothing, but tell the user before going on.",
        ],
      },
    ]);
  });

  it("AC3: adds nothing when no file falls in another session's front", () => {
    expect(foreignFrontsBlock([], ES)).toEqual([]);
  });
});
