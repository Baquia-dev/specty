// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type FreshUnit,
  freshCard,
  freshMemoryText,
  freshProgressLine,
  freshRefusalCard,
  type MemoryEntry,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const A = { name: "a", command: "pnpm --filter a test" };
const B = { name: "b", command: "pnpm --filter b test" };
const C = { name: "c", command: "pnpm --filter c test" };
const FULL = { command: "pnpm check" };

/** One unit that passed, one flaky and one that failed twice, each with its time. */
const UNITS: readonly FreshUnit[] = [
  { ...A, result: "passed", ms: [1_200], output: [] },
  { ...B, result: "flaky", ms: [3_400, 2_100], output: ["FAIL test/b.test.ts > tarda"] },
  { ...C, result: "failed", ms: [1_000, 61_000], output: ["rompe c"] },
];

/** The entry the memory keeps for `text`: a lesson with `paths`, otherwise a pending item. */
const entry = (id: string, text: string, paths?: readonly string[]): MemoryEntry => ({
  id,
  kind: paths === undefined ? "pending" : "lesson",
  status: "open",
  created: "2026-11-05T10:00:00.000Z",
  origin: { by: "claude-code" },
  ...(paths === undefined ? {} : { paths }),
  text,
});

describe("the texts a fresh verification leaves in the memory", () => {
  it("AC5: a flaky unit, a unit that failed twice and verify.full, in Spanish", () => {
    expect(freshMemoryText(B, "flaky", "es")).toBe(
      "La unidad `b` de la verificación completa (`pnpm --filter b test`) falló y pasó al repetirla en una verificación fresca: tiene tests inestables. Si falla en un cambio que toca sus archivos, repítela antes de buscar el error en el cambio, y arregla el test inestable cuando des con él.",
    );
    expect(freshMemoryText(C, "failed", "es")).toBe(
      "La unidad `c` de la verificación completa (`pnpm --filter c test`) falló dos veces seguidas en una verificación fresca. Arréglala; si el fallo no es del código, revisa su comando y sus `paths` en `.specty/config.yaml`.",
    );
    expect(freshMemoryText(FULL, "flaky", "es")).toBe(
      "La verificación completa (`pnpm check`) falló y pasó al repetirla en una verificación fresca: tiene tests inestables. Búscalos y arréglalos.",
    );
    expect(freshMemoryText(FULL, "failed", "es")).toBe(
      "La verificación completa (`pnpm check`) falló dos veces seguidas en una verificación fresca. Arréglala.",
    );
  });

  it("AC5: the same in English", () => {
    expect(freshMemoryText(B, "flaky", "en")).toBe(
      "Unit `b` of the full verification (`pnpm --filter b test`) failed and passed when run again in a fresh verification: it has flaky tests. If it fails in a change that touches its files, run it again before looking for the error in the change, and fix the flaky test once you find it.",
    );
    expect(freshMemoryText(C, "failed", "en")).toBe(
      "Unit `c` of the full verification (`pnpm --filter c test`) failed twice in a row in a fresh verification. Fix it; if the failure is not in the code, review its command and its `paths` in `.specty/config.yaml`.",
    );
    expect(freshMemoryText(FULL, "flaky", "en")).toBe(
      "The full verification (`pnpm check`) failed and passed when run again in a fresh verification: it has flaky tests. Find them and fix them.",
    );
    expect(freshMemoryText(FULL, "failed", "en")).toBe(
      "The full verification (`pnpm check`) failed twice in a row in a fresh verification. Fix it.",
    );
  });
});

describe("the line before each attempt", () => {
  it("AC5: says what runs, and what runs once more, in Spanish and in English", () => {
    expect(freshProgressLine(A, false, "es")).toBe("Ejecutando a (`pnpm --filter a test`)…");
    expect(freshProgressLine(A, true, "es")).toBe(
      "a falló: se repite una vez (`pnpm --filter a test`)…",
    );
    expect(freshProgressLine(FULL, false, "es")).toBe("Ejecutando verify.full (`pnpm check`)…");
    expect(freshProgressLine(A, false, "en")).toBe("Running a (`pnpm --filter a test`)…");
    expect(freshProgressLine(A, true, "en")).toBe(
      "a failed: running it once more (`pnpm --filter a test`)…",
    );
  });
});

describe("the card of a fresh verification", () => {
  const remembered = [
    entry("P7", freshMemoryText(B, "flaky", "es"), ["packages/b/**"]),
    entry("P8", freshMemoryText(C, "failed", "es")),
  ];

  it("AC5: gives each unit's result and time, the output of each failure, the record and the memory, in Spanish", () => {
    const card = freshCard({ units: UNITS, recorded: ["a", "b"], remembered }, ES);
    expect(card.status).toBe("invalid");
    expect(card.header).toBe("SPECTY · verificación fresca");
    expect(card.blocks).toEqual([
      {
        title: "VERIFICACIÓN FRESCA, SIN EL REGISTRO",
        lines: [
          "a · correcta · 1 s",
          "b · inestable: falló y pasó al repetirla · 3 s + 2 s",
          "c · falló las dos veces · 1 s + 1 min 1 s",
          "Anotadas en el registro del clon, no se repiten con este código: a, b.",
        ],
      },
      { title: "SALIDA DEL FALLO DE b", lines: ["FAIL test/b.test.ts > tarda"] },
      { title: "SALIDA DEL FALLO DE c", lines: ["rompe c"] },
      { title: "EN LA MEMORIA", lines: ["P7 · lección · b", "P8 · pendiente · c"] },
    ]);
    expect(card.next).toBe(
      "corrige el fallo de c (su salida está arriba) y vuelve a ejecutar `specty verify --fresh`.",
    );
  });

  it("AC5: says the same in English", () => {
    const english = [
      entry("P7", freshMemoryText(B, "flaky", "en"), ["packages/b/**"]),
      entry("P8", freshMemoryText(C, "failed", "en")),
    ];
    const card = freshCard({ units: UNITS, recorded: ["a", "b"], remembered: english }, EN);
    expect(card.header).toBe("SPECTY · fresh verification");
    expect(card.blocks).toEqual([
      {
        title: "FRESH VERIFICATION, WITHOUT THE RECORD",
        lines: [
          "a · passed · 1 s",
          "b · flaky: failed and passed when run again · 3 s + 2 s",
          "c · failed twice · 1 s + 1 min 1 s",
          "Put into the clone's record, they do not run again on this code: a, b.",
        ],
      },
      { title: "OUTPUT OF THE FAILURE OF b", lines: ["FAIL test/b.test.ts > tarda"] },
      { title: "OUTPUT OF THE FAILURE OF c", lines: ["rompe c"] },
      { title: "IN THE MEMORY", lines: ["P7 · lesson · b", "P8 · pending · c"] },
    ]);
    expect(card.next).toBe(
      "fix the failure of c (its output is above) and run `specty verify --fresh` again.",
    );
  });

  it("AC5: with every unit passed, nothing recorded and nothing remembered, only goes on", () => {
    const full: FreshUnit = { ...FULL, result: "passed", ms: [5_000], output: [] };
    const card = freshCard({ units: [full], recorded: [], remembered: [] }, ES);
    expect(card.status).toBe("ok");
    expect(card.blocks).toEqual([
      { title: "VERIFICACIÓN FRESCA, SIN EL REGISTRO", lines: ["verify.full · correcta · 5 s"] },
    ]);
    expect(card.next).toBe("sigue con `specty next`.");
    expect(freshCard({ units: [full], recorded: [], remembered: [] }, EN).next).toBe(
      "go on with `specty next`.",
    );
  });
});

describe("why specty verify runs nothing", () => {
  it("AC5: without --fresh, in Spanish and in English", () => {
    const es = freshRefusalCard({ reason: "no-flag" }, ES);
    expect(es.status).toBe("invalid");
    expect(es.blocks).toEqual([
      {
        lines: [
          "`specty verify` solo ejecuta, por ahora, la verificación fresca: todas las unidades, sin el registro de las que ya pasaron.",
        ],
      },
    ]);
    expect(es.next).toBe("ejecuta `specty verify --fresh`.");
    const en = freshRefusalCard({ reason: "no-flag" }, EN);
    expect(en.blocks).toEqual([
      {
        lines: [
          "`specty verify` only runs, for now, the fresh verification: every unit, without the record of those that passed.",
        ],
      },
    ]);
    expect(en.next).toBe("run `specty verify --fresh`.");
  });

  it("AC5: without verify.full nor verify.units, in Spanish and in English", () => {
    const es = freshRefusalCard({ reason: "no-verification" }, ES);
    expect(es.status).toBe("invalid");
    expect(es.blocks).toEqual([
      {
        lines: [
          "No hay verificación completa que ejecutar: `.specty/config.yaml` no da `verify.full` ni `verify.units`.",
        ],
      },
    ]);
    expect(es.next).toBe(
      "define `verify.full` o `verify.units` en `.specty/config.yaml` (docs/formats.md §6) y vuelve a ejecutarlo.",
    );
    const en = freshRefusalCard({ reason: "no-verification" }, EN);
    expect(en.blocks).toEqual([
      {
        lines: [
          "There is no full verification to run: `.specty/config.yaml` gives neither `verify.full` nor `verify.units`.",
        ],
      },
    ]);
    expect(en.next).toBe(
      "set `verify.full` or `verify.units` in `.specty/config.yaml` (docs/formats.md §6) and run it again.",
    );
  });
});
