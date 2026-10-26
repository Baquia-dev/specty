// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  notInTargetBranchLine,
  notInTargetFolderLine,
  preparingNote,
  pruneCard,
  renderText,
  type SliceRefusal,
  sharedLine,
  sharedTitle,
  sliceRefusalCard,
  verifyHintLine,
  workingFolderLine,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("working in parallel", () => {
  it("names the files another open change also lists", () => {
    expect(sharedTitle("es")).toBe("ARCHIVOS COMPARTIDOS");
    expect(sharedLine("src/a.ts", ["20261020-otro"], "es")).toBe(
      "src/a.ts — también en 20261020-otro",
    );
    expect(sharedLine("src/a.ts", ["x", "y"], "en")).toBe("src/a.ts — also in x, y");
    expect(preparingNote("pnpm install", "en")).toBe(
      "specty: preparing the folder with `pnpm install`…",
    );
  });

  it("cleans up what is finished, and says what it kept and why", () => {
    const card = pruneCard(
      {
        folders: ["/w/viejo"],
        branches: [],
        kept: [
          workingFolderLine("/w/x", "es"),
          notInTargetFolderLine("/w/y", "20261020-y", "main", "es"),
          notInTargetBranchLine("specty/z", "main", "es"),
        ],
      },
      ES,
    );
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY · limpieza",
        "CARPETAS BORRADAS:",
        "  /w/viejo",
        "QUEDAN:",
        "  /w/x: una sesión de agente trabaja en ella.",
        "  /w/y: 20261020-y aún no está en main.",
        "  specty/z: no está en main.",
        'SIGUIENTE: para otro cambio, `specty new "<título>"`.',
      ].join("\n"),
    );
    expect(renderText(pruneCard({ folders: [], branches: [], kept: [] }, EN), "en")).toBe(
      'SPECTY · cleanup\nThere was nothing to clean up.\nNEXT: for another change, `specty new "<title>"`.',
    );
    expect(notInTargetFolderLine("/w/y", "x", "main", "en")).toBe("/w/y: x is not in main yet.");
  });

  it("proposes `init` when the closing detects a verification the configuration lacks", () => {
    expect(verifyHintLine(["verify.default (`pnpm test`)"], "/repo", ES)).toBe(
      "Specty detecta ahora verify.default (`pnpm test`), que .specty/config.yaml no tiene: `specty init` en /repo lo añade.",
    );
    expect(verifyHintLine(["a", "b"], "/repo", EN)).toBe(
      "Specty now detects a and b, which .specty/config.yaml lacks: `specty init` in /repo adds it.",
    );
  });
});

describe("a slice that cannot start", () => {
  const cases: readonly [SliceRefusal, "invalid" | "blocked", string][] = [
    [
      { reason: "incomplete" },
      "invalid",
      "`--epic` y `--slice` van juntos: la épica y el corte que implementa el cambio.",
    ],
    [{ reason: "no-epic", epic: "e1" }, "invalid", "No hay ninguna épica abierta e1."],
    [
      { reason: "not-approved", epic: "e1", phase: "review" },
      "blocked",
      "La épica e1 aún no está aprobada (fase review).",
    ],
    [
      { reason: "no-slice", epic: "e1", slice: "C9", slices: ["C1", "C2"] },
      "invalid",
      "La épica e1 no tiene el corte C9; sus cortes: C1, C2.",
    ],
    [
      { reason: "taken", slice: "C1", child: { id: "20261020-c1", phase: "implementing" } },
      "blocked",
      "El corte C1 ya tiene un cambio: 20261020-c1, en implementing.",
    ],
    [
      { reason: "waiting", slice: "C3", waiting: ["C1", "C2"] },
      "blocked",
      "El corte C3 depende de cortes que aún no están cerrados: C1, C2.",
    ],
  ];

  it("says why, with the status of each case", () => {
    for (const [refusal, status, reason] of cases) {
      const card = sliceRefusalCard(refusal, ES);
      expect(card.status).toBe(status);
      expect(card.blocks[0]?.lines).toEqual([reason]);
    }
  });

  it("sends back to the epic's folder, or says how to name the slice", () => {
    expect(sliceRefusalCard({ reason: "incomplete" }, EN).next).toBe(
      'run `specty new "<title>" --epic <epic> --slice <slice>`.',
    );
    expect(sliceRefusalCard({ reason: "no-epic", epic: "e1" }, ES).next).toBe(
      "revisa su id con `specty status`.",
    );
    expect(sliceRefusalCard({ reason: "waiting", slice: "C3", waiting: ["C1"] }, EN).next).toBe(
      "run `specty next` in the epic's folder, which says which slice comes next.",
    );
  });
});
