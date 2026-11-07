// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  FLOW_PHASES,
  flowPhases,
  flowSentences,
  isEquipped,
  PIECES,
  pieceEdits,
  pieceText,
  SETTINGS,
  settingOf,
} from "../../src/light";
import { DEFAULT_CONFIG } from "../../src/schema/config";

/** The value at a key with dots, inside maps; none when a key on the way is missing. */
function valueAt(source: unknown, key: string): unknown {
  let value = source;
  for (const part of key.split(".")) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    value = Object.entries(value).find(([name]) => name === part)?.[1];
  }
  return value;
}

/** The value Specty uses with the file `input`: the file's, else the default; delegated mode, the clone's. */
const using =
  (input: unknown, delegated?: boolean) =>
  (key: string): unknown =>
    key === "specty delegate" ? delegated : (valueAt(input, key) ?? valueAt(DEFAULT_CONFIG, key));

const defaults = (key: string): unknown => valueAt(DEFAULT_CONFIG, key);

/** A project like this repository: its commands, tests as contract and a build after landing. */
const PROJECT = {
  version: 1,
  verify: { default: "pnpm test", full: "pnpm check", timeoutSec: 2000 },
  policy: { tests: "contract" },
  git: { afterLanding: "pnpm build" },
};

/** The sentences of the default limits, which end the flow's. */
const LIMITS_ES = [
  "Una tarea no puede dejar un archivo con más de 500 líneas de código, y Specty avisa por encima de 300.",
  "`specty check` señala cada función de más de 50 líneas o con complejidad mayor que 10.",
  "La cobertura del diff avisa si los tests ejecutan menos del 80 % de las líneas que añade el cambio.",
];
const LIMITS_EN = [
  "A task cannot leave a file with more than 500 lines of code, and Specty warns above 300.",
  "`specty check` points out each function of more than 50 lines or with a complexity above 10.",
  "Diff coverage warns when the tests run less than 80% of the lines the change adds.",
];

const piece = (id: string) => {
  const found = PIECES.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no piece ${id}`);
  return found;
};

const equippedIds = (value: (key: string) => unknown) =>
  PIECES.filter((candidate) => isEquipped(candidate, value)).map((candidate) => candidate.id);

describe("the phases of the flow and their pieces", () => {
  it("AC1: has the six phases in order, Tests only with policy.tests: contract", () => {
    expect(FLOW_PHASES).toEqual([
      "draft",
      "review",
      "testing",
      "implementing",
      "acceptance",
      "closing",
    ]);
    expect(flowPhases(using({ policy: { tests: "contract" } }))).toEqual(FLOW_PHASES);
    for (const tests of ["required", "recommended", "off"]) {
      expect(flowPhases(using({ policy: { tests } })), tests).toEqual([
        "draft",
        "review",
        "implementing",
        "acceptance",
        "closing",
      ]);
    }
    expect(flowPhases(using({}))).not.toContain("testing");
  });

  it("AC1: gives each phase its pieces, in order, adjusted with settings of the catalog", () => {
    const byPhase = Object.fromEntries(
      FLOW_PHASES.map((phase) => [
        phase,
        PIECES.filter((candidate) => candidate.phase === phase).map((candidate) => candidate.id),
      ]),
    );
    expect(byPhase).toEqual({
      draft: ["glossary", "spec-warnings", "worktrees"],
      review: ["spec-approval", "independent-review", "delegated"],
      testing: ["tests-approval"],
      implementing: [
        "tests",
        "task-verify",
        "quick-check",
        "checks",
        "lines",
        "subagents",
        "auto-approve",
        "pre-commit",
        "guard",
      ],
      acceptance: ["full-verify", "coverage", "acceptance"],
      closing: ["closing", "retro", "after-landing"],
    });
    expect(PIECES.map((candidate) => candidate.phase)).toEqual(
      PIECES.map((candidate) => candidate.phase).toSorted(
        (a, b) => FLOW_PHASES.indexOf(a) - FLOW_PHASES.indexOf(b),
      ),
    );
    expect(new Set(PIECES.map((candidate) => candidate.id)).size).toBe(PIECES.length);
    const keys = PIECES.flatMap((candidate) => candidate.keys);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(
        SETTINGS.some((setting) => setting.key === key),
        key,
      ).toBe(true);
    }
    expect(piece("independent-review").keys).toEqual(["review.command", "review.timeoutSec"]);
    expect(piece("subagents").keys).toEqual(["subagents"]);
    expect(piece("delegated").keys).toEqual(["specty delegate"]);
  });

  it("AC1: equips each piece by the configuration, with the defaults where the file says nothing", () => {
    expect(equippedIds(using(PROJECT, false))).toEqual([
      "glossary",
      "spec-warnings",
      "worktrees",
      "spec-approval",
      "tests-approval",
      "tests",
      "task-verify",
      "checks",
      "lines",
      "subagents",
      "auto-approve",
      "guard",
      "full-verify",
      "coverage",
      "acceptance",
      "closing",
      "retro",
      "after-landing",
    ]);
    const other = {
      ...PROJECT,
      verify: { ...PROJECT.verify, quick: "pnpm lint" },
      review: { command: "claude -p" },
      subagents: false,
      scope: { autoApprove: "none" },
      checks: { preCommit: true },
      retro: { mode: "minimal" },
      git: { worktrees: false },
    };
    const value = using(other, true);
    for (const id of ["quick-check", "independent-review", "pre-commit", "delegated"]) {
      expect(isEquipped(piece(id), value), id).toBe(true);
    }
    for (const id of ["subagents", "auto-approve", "retro", "worktrees", "after-landing"]) {
      expect(isEquipped(piece(id), value), id).toBe(false);
    }
  });

  it("AC2: makes the spec's approval, the tests contract's, the person's acceptance and the agent's guard guarantees, with no key, always equipped", () => {
    expect(
      PIECES.filter((candidate) => candidate.guarantee === true).map((candidate) => [
        candidate.id,
        candidate.phase,
      ]),
    ).toEqual([
      ["spec-approval", "review"],
      ["tests-approval", "testing"],
      ["guard", "implementing"],
      ["acceptance", "acceptance"],
    ]);
    for (const guarantee of PIECES.filter((candidate) => candidate.guarantee === true)) {
      expect(guarantee.keys, guarantee.id).toEqual([]);
      expect(isEquipped(guarantee, using({ policy: { tests: "off" } })), guarantee.id).toBe(true);
      expect(pieceEdits(guarantee, false, defaults), guarantee.id).toEqual([]);
      expect(pieceEdits(guarantee, true, defaults), guarantee.id).toEqual([]);
    }
  });

  it("AC6: removes and equips a yes-or-no piece by its key, and takes the key out where the value is the default", () => {
    expect(pieceEdits(piece("subagents"), false, defaults)).toEqual([
      { path: ["subagents"], value: false },
    ]);
    expect(pieceEdits(piece("subagents"), true, defaults)).toEqual([{ path: ["subagents"] }]);
    expect(pieceEdits(piece("pre-commit"), true, defaults)).toEqual([
      { path: ["checks", "preCommit"], value: true },
    ]);
    expect(pieceEdits(piece("pre-commit"), false, defaults)).toEqual([
      { path: ["checks", "preCommit"] },
    ]);
    expect(pieceEdits(piece("auto-approve"), false, defaults)).toEqual([
      { path: ["scope", "autoApprove"], value: "none" },
    ]);
    expect(pieceEdits(piece("retro"), false, defaults)).toEqual([
      { path: ["retro", "mode"], value: "minimal" },
    ]);
    expect(pieceEdits(piece("worktrees"), false, defaults)).toEqual([
      { path: ["git", "worktrees"], value: false },
    ]);
    for (const candidate of PIECES) {
      for (const equip of [true, false]) {
        for (const edit of pieceEdits(candidate, equip, defaults)) {
          expect(settingOf(edit.path)?.key, candidate.id).toBe(edit.path.join("."));
        }
      }
    }
  });

  it("AC7: removes a command piece by taking its keys out, and equips it with no edit until its command is written", () => {
    expect(pieceEdits(piece("independent-review"), false, defaults)).toEqual([
      { path: ["review", "command"] },
      { path: ["review", "timeoutSec"] },
    ]);
    expect(pieceEdits(piece("quick-check"), false, defaults)).toEqual([
      { path: ["verify", "quick"] },
    ]);
    expect(pieceEdits(piece("after-landing"), false, defaults)).toEqual([
      { path: ["git", "afterLanding"] },
    ]);
    for (const id of ["independent-review", "quick-check", "after-landing"]) {
      expect(pieceEdits(piece(id), true, defaults), id).toEqual([]);
    }
    expect(isEquipped(piece("quick-check"), using({}))).toBe(false);
    expect(isEquipped(piece("quick-check"), using({ verify: { quick: "pnpm lint" } }))).toBe(true);
  });

  it("AC6, AC7: has no edit for the pieces that are always equipped, for delegated mode, which lives in the clone, nor for the closing phase", () => {
    for (const id of [
      "glossary",
      "spec-warnings",
      "tests",
      "task-verify",
      "checks",
      "lines",
      "full-verify",
      "coverage",
      "delegated",
      "closing",
    ]) {
      expect(pieceEdits(piece(id), false, defaults), id).toEqual([]);
      expect(pieceEdits(piece(id), true, defaults), id).toEqual([]);
    }
    expect(piece("delegated").clone).toBe(true);
    expect(isEquipped(piece("delegated"), using({}, false))).toBe(false);
    expect(isEquipped(piece("delegated"), using({}, undefined))).toBe(false);
  });

  it("AC9: shows the closing phase, which has no key until C5, as coming soon and equipped", () => {
    expect(PIECES.filter((candidate) => candidate.soon === true).map(({ id }) => id)).toEqual([
      "closing",
    ]);
    expect(piece("closing").keys).toEqual([]);
    expect(isEquipped(piece("closing"), using({}))).toBe(true);
  });
});

describe("the texts of the pieces", () => {
  it("AC12: names each piece in Spanish and in English", () => {
    expect(
      PIECES.map((candidate) => [
        candidate.id,
        pieceText(candidate.id, "es").name,
        pieceText(candidate.id, "en").name,
      ]),
    ).toEqual([
      ["glossary", "Glosario del dominio", "Domain glossary"],
      ["spec-warnings", "Avisos de la spec", "Spec warnings"],
      ["worktrees", "Una carpeta por cambio", "A folder per change"],
      ["spec-approval", "Tu aprobación de la spec", "Your approval of the spec"],
      ["independent-review", "Revisión independiente", "Independent review"],
      ["delegated", "Modo delegado", "Delegated mode"],
      [
        "tests-approval",
        "Tu aprobación del contrato de tests",
        "Your approval of the tests contract",
      ],
      ["tests", "Política de tests", "Tests policy"],
      ["task-verify", "Verificación de la tarea", "Task verification"],
      ["quick-check", "Comprobación rápida", "Quick check"],
      ["checks", "specty check de lo cambiado", "specty check of what changes"],
      ["lines", "Límite de líneas por archivo", "Lines per file limit"],
      ["subagents", "Subagentes", "Subagents"],
      ["auto-approve", "Ampliación automática", "Automatic scope"],
      ["pre-commit", "specty check en el pre-commit", "specty check on pre-commit"],
      ["guard", "Guard del agente", "Agent guard"],
      ["full-verify", "Verificación completa", "Full verification"],
      ["coverage", "Cobertura del diff", "Diff coverage"],
      ["acceptance", "Tu aceptación", "Your acceptance"],
      ["closing", "Fase de cierre", "Closing phase"],
      ["retro", "Retro del agente", "Retro by the agent"],
      ["after-landing", "Al incorporar un cambio", "When a change lands"],
    ]);
  });

  it("AC12: describes each piece in Spanish and in English", () => {
    for (const candidate of PIECES) {
      const es = pieceText(candidate.id, "es").description;
      const en = pieceText(candidate.id, "en").description;
      expect(es, candidate.id).not.toBe("");
      expect(en, candidate.id).not.toBe("");
      expect(es, candidate.id).not.toBe(en);
    }
  });

  it("AC2, AC12: says why each guarantee is not removed, in Spanish and in English, and nothing of the other pieces", () => {
    expect(
      PIECES.filter((candidate) => candidate.guarantee === true).map((candidate) => [
        pieceText(candidate.id, "es").why,
        pieceText(candidate.id, "en").why,
      ]),
    ).toEqual([
      [
        "No se quita: sin una spec aprobada, Specty no deja escribir código.",
        "It cannot be removed: without an approved spec, Specty lets no code be written.",
      ],
      [
        "No se quita: los tests que apruebas son el contrato que el código debe cumplir.",
        "It cannot be removed: the tests you approve are the contract the code must meet.",
      ],
      [
        "No se quita: sin él, el agente podría saltarse la spec.",
        "It cannot be removed: without it, the agent could skip the spec.",
      ],
      [
        "No se quita: un cambio no termina sin tu aceptación.",
        "It cannot be removed: a change does not end without your acceptance.",
      ],
    ]);
    for (const candidate of PIECES.filter((other) => other.guarantee !== true)) {
      expect(pieceText(candidate.id, "es").why, candidate.id).toBeUndefined();
    }
  });
});

describe("what the configured flow does, in sentences", () => {
  it("AC3, AC12: says it for the project's tests, verifications, review, quick changes and delegated mode, in Spanish and in English", () => {
    const value = using(
      { ...PROJECT, verify: { default: "pnpm test", full: "pnpm check" } },
      false,
    );
    expect(flowSentences(value, "es")).toEqual([
      "Las features piden sus tests aprobados antes del código.",
      "Cada tarea pasa `pnpm test` antes de completarse.",
      "Al aceptar, Specty ejecuta `pnpm check`.",
      "Sin revisión independiente: la spec y el diff los revisas tú.",
      "Un cambio rápido toca como mucho 3 archivos de código.",
      "Tú apruebas, aceptas y cierras cada cambio.",
      ...LIMITS_ES,
    ]);
    expect(flowSentences(value, "en")).toEqual([
      "Features need their tests approved before their code.",
      "Each task passes `pnpm test` before it is done.",
      "On accepting, Specty runs `pnpm check`.",
      "No independent review: you review the spec and the diff.",
      "A quick change touches at most 3 code files.",
      "You approve, accept and close each change.",
      ...LIMITS_EN,
    ]);
  });

  it("AC3: follows the configuration: required tests, no default verification, units, a review command, more files and delegated mode on", () => {
    const value = using(
      {
        policy: { tests: "required" },
        verify: {
          full: "pnpm check",
          units: [
            { name: "core", command: "pnpm test:core", paths: ["core/**"] },
            { name: "ui", command: "pnpm test:ui", paths: ["ui/**"] },
          ],
        },
        review: { command: "claude -p" },
        lanes: { quick: { maxFiles: 5 } },
      },
      true,
    );
    expect(flowSentences(value, "es")).toEqual([
      "Cada tarea de código lleva sus tests.",
      "Cada tarea lleva su verificación en la spec.",
      "Al aceptar, Specty ejecuta la verificación completa en 2 unidades.",
      "La revisión independiente ejecuta `claude -p`; cuesta tokens en cada revisión.",
      "Un cambio rápido toca como mucho 5 archivos de código.",
      "Modo delegado activo: tu agente aprueba, acepta y cierra por ti.",
      ...LIMITS_ES,
    ]);
    expect(flowSentences(value, "en")).toEqual([
      "Each code task comes with its tests.",
      "Each task brings its verification in the spec.",
      "On accepting, Specty runs the full verification in 2 units.",
      "The independent review runs `claude -p`; each review costs tokens.",
      "A quick change touches at most 5 code files.",
      "Delegated mode on: your agent approves, accepts and closes for you.",
      ...LIMITS_EN,
    ]);
  });

  it("AC3: says when tests are only recommended or off and when there is no full verification, and says nothing of delegated mode the source cannot tell", () => {
    expect(flowSentences(using({ policy: { tests: "recommended" } }), "es")).toEqual([
      "Specty avisa de una tarea de código sin tests, pero no los exige.",
      "Cada tarea lleva su verificación en la spec.",
      "Al aceptar no hay verificación completa.",
      "Sin revisión independiente: la spec y el diff los revisas tú.",
      "Un cambio rápido toca como mucho 3 archivos de código.",
      ...LIMITS_ES,
    ]);
    expect(flowSentences(using({ policy: { tests: "off" } }), "en").slice(0, 3)).toEqual([
      "Specty does not ask for tests.",
      "Each task brings its verification in the spec.",
      "There is no full verification on accepting.",
    ]);
    expect(flowSentences(using({ policy: { tests: "off" } }), "es")[0]).toBe(
      "Specty no pide tests.",
    );
  });

  it("AC4, AC9: ends with the limits of the configuration: lines per file, functions and diff coverage", () => {
    const value = using({
      lines: { warn: 500, fail: 1000 },
      checks: { functions: { maxLines: 100, complexity: 20 }, coverage: { warn: 90, error: 80 } },
    });
    expect(flowSentences(value, "es").slice(-3)).toEqual([
      "Una tarea no puede dejar un archivo con más de 1000 líneas de código, y Specty avisa por encima de 500.",
      "`specty check` señala cada función de más de 100 líneas o con complejidad mayor que 20.",
      "La cobertura del diff falla si los tests ejecutan menos del 80 % de las líneas que añade el cambio, y avisa por debajo del 90 %.",
    ]);
    expect(flowSentences(value, "en").slice(-3)).toEqual([
      "A task cannot leave a file with more than 1000 lines of code, and Specty warns above 500.",
      "`specty check` points out each function of more than 100 lines or with a complexity above 20.",
      "Diff coverage fails when the tests run less than 80% of the lines the change adds, and warns below 90%.",
    ]);
  });

  it("AC4, AC9: says a file limit that never blocks the task", () => {
    const value = using({ lines: { warn: 250, fail: false } });
    expect(flowSentences(value, "es").at(-3)).toBe(
      "Specty avisa de un archivo con más de 250 líneas de código, sin bloquear la tarea.",
    );
    expect(flowSentences(value, "en").at(-3)).toBe(
      "Specty warns of a file with more than 250 lines of code, without blocking the task.",
    );
  });
});

describe("the basic mode of the view General", () => {
  it("AC4: marks as basic the twelve settings it shows, in the page's order", () => {
    expect(SETTINGS.filter((setting) => setting.basic === true).map(({ key }) => key)).toEqual([
      "language",
      "mode",
      "policy.tests",
      "subagents",
      "retro.mode",
      "verify.default",
      "verify.full",
      "verify.timeoutSec",
      "git.worktrees",
      "git.flow",
      "git.afterLanding",
      "review.command",
    ]);
  });
});
