// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  DEFAULT_CONFIG,
  decideGuard,
  type GuardChange,
  renderText,
  UNLOCK_LIMITS,
  type UnlockRefusal,
  unlockRefusalCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const HEADER = "SPECTY · 20261106-saludo · implementing";
const ASKED = { task: "T1", paths: ["src/app.test.ts"] };

const FULL_ES =
  '`specty scope add src/app.test.ts --task T1 --reason "<motivo>" --patch <parche> --evidence <ruta>:<desde>-<hasta>`';
const FULL_EN =
  '`specty scope add src/app.test.ts --task T1 --reason "<reason>" --patch <patch> --evidence <path>:<from>-<to>`';
const OPTIONS_ES =
  "`--patch` es el cambio exacto que harás al test: un diff unificado, como lo escribe `git diff`, con las rutas `a/<ruta>` y `b/<ruta>`, en un archivo o, con `--patch -`, por la entrada estándar; también puede borrarlo. `--evidence` son las líneas que lo justifican, de código, de otro test o de la spec, en un archivo que git sigue: de 1 a 5, de 40 líneas como máximo cada una.";
const OPTIONS_EN =
  "`--patch` is the exact change you will make to the test: a unified diff, as `git diff` writes it, with the paths `a/<path>` and `b/<path>`, in a file or, with `--patch -`, on standard input; it may also delete it. `--evidence` is the lines that justify it, of code, of another test or of the spec, in a file git tracks: from 1 to 5, of 40 lines at most each.";

/** The lines of the card that refuses `refusal`, in `ctx`'s language. */
const lines = (refusal: UnlockRefusal, ctx: CardContext = ES) =>
  unlockRefusalCard(refusal, ASKED, HEADER, ctx).blocks.flatMap((block) => block.lines);

describe("the limits of an unlock", () => {
  it("AC3 AC4: are the epic's", () => {
    expect(UNLOCK_LIMITS).toEqual({ patchLines: 500, evidence: 5, evidenceLines: 40 });
  });
});

describe("an unlock without its patch or its evidence", () => {
  it("AC1: says what is missing, what each option is and the full command", () => {
    const card = unlockRefusalCard(
      { reason: "incomplete", missing: ["patch", "evidence"] },
      ASKED,
      HEADER,
      ES,
    );
    expect(card.status).toBe("invalid");
    expect(renderText(card, "es")).toBe(
      [
        HEADER,
        "Para desbloquear un test aprobado faltan `--patch` y `--evidence`.",
        OPTIONS_ES,
        `SIGUIENTE: pídelo con ${FULL_ES}.`,
      ].join("\n"),
    );
    expect(lines({ reason: "incomplete", missing: ["patch"] })[0]).toBe(
      "Para desbloquear un test aprobado falta `--patch`.",
    );
    expect(lines({ reason: "incomplete", missing: ["evidence"] })[0]).toBe(
      "Para desbloquear un test aprobado falta `--evidence`.",
    );
  });

  it("AC1 AC8: says it in English too", () => {
    const card = unlockRefusalCard(
      { reason: "incomplete", missing: ["patch", "evidence"] },
      ASKED,
      HEADER,
      EN,
    );
    expect(card.blocks[0]?.lines).toEqual([
      "Unlocking an approved test needs `--patch` and `--evidence`.",
      OPTIONS_EN,
    ]);
    expect(card.next).toBe(`ask for it with ${FULL_EN}.`);
    expect(lines({ reason: "incomplete", missing: ["patch"] }, EN)[0]).toBe(
      "Unlocking an approved test needs `--patch`.",
    );
    expect(lines({ reason: "incomplete", missing: ["evidence"] }, EN)[0]).toBe(
      "Unlocking an approved test needs `--evidence`.",
    );
  });

  it("AC1: names every path the command named, and the task", () => {
    const card = unlockRefusalCard(
      { reason: "incomplete", missing: ["evidence"] },
      { task: "T2", paths: ["src/a.test.ts", "src/b.ts"] },
      HEADER,
      ES,
    );
    expect(card.next).toBe(
      'pídelo con `specty scope add src/a.test.ts src/b.ts --task T2 --reason "<motivo>" --patch <parche> --evidence <ruta>:<desde>-<hasta>`.',
    );
  });
});

describe("the guard before an approved test", () => {
  const locked: GuardChange = {
    id: "20261106-saludo",
    kind: "standard",
    phase: "implementing",
    closingSubmitted: false,
    specPath: ".specty/changes/20261106-saludo/spec.md",
    task: { id: "T1", files: ["src/app.ts"], extras: [] },
    locked: ["src/app.test.ts"],
  };
  const denied = (lang: "es" | "en") =>
    decideGuard(
      { kind: "write", paths: ["src/app.test.ts"] },
      { config: DEFAULT_CONFIG, lang, command: "specty", change: locked },
    );

  it("AC2: gives the full command to ask for the unlock, and what each option is", () => {
    const es = denied("es");
    expect(es).toMatchObject({ allow: false, rule: "locked" });
    if (es.allow) return;
    expect(es.next).toContain(`pide desbloquearlo con ${FULL_ES}, que solo decide la persona.`);
    expect(es.next).toContain(OPTIONS_ES);
    expect(es.next).toContain("Los tests nuevos van en archivos nuevos.");
  });

  it("AC2 AC8: gives it in English too", () => {
    const en = denied("en");
    if (en.allow) throw new Error("the guard let an approved test change");
    expect(en.next).toContain(`ask to unlock it with ${FULL_EN}, which only the person decides.`);
    expect(en.next).toContain(OPTIONS_EN);
  });

  it("AC2: leaves the task for the agent to fill when none is active", () => {
    const { task: _task, ...idle } = locked;
    const verdict = decideGuard(
      { kind: "write", paths: ["src/app.test.ts"] },
      { config: DEFAULT_CONFIG, lang: "es", command: "specty", change: idle },
    );
    if (verdict.allow) throw new Error("the guard let an approved test change");
    expect(verdict.next).toContain("`specty scope add src/app.test.ts --task <T> --reason");
  });
});

describe("a patch that does not do", () => {
  it("AC3: says why, and how to ask again", () => {
    const fix = `corrígelo y vuelve a pedirlo con ${FULL_ES}.`;
    const cases: readonly (readonly [UnlockRefusal, string])[] = [
      [
        { reason: "patch-unreadable", file: "fix.patch" },
        "No se puede leer el parche `fix.patch`.",
      ],
      [{ reason: "patch-too-long", lines: 501 }, "El parche tiene 501 líneas, y el máximo es 500."],
      [
        { reason: "patch-invalid", detail: "error: No valid patches in input" },
        "El parche no es un diff unificado: `git apply` dice «error: No valid patches in input».",
      ],
      [
        { reason: "patch-other-files", paths: ["src/app.ts", "README.md"] },
        "El parche toca archivos que no son los tests que pides desbloquear: src/app.ts, README.md.",
      ],
      [
        { reason: "patch-not-applying", detail: "error: src/app.test.ts: patch does not apply" },
        "El parche no se aplica a la versión bloqueada del test: `git apply` dice «error: src/app.test.ts: patch does not apply».",
      ],
    ];
    for (const [refusal, line] of cases) {
      const card = unlockRefusalCard(refusal, ASKED, HEADER, ES);
      expect(card.status, refusal.reason).toBe("invalid");
      expect(card.blocks[0]?.lines, refusal.reason).toEqual([line]);
      expect(card.next, refusal.reason).toBe(fix);
    }
  });

  it("AC3: names each test that is no longer as it was locked", () => {
    expect(lines({ reason: "patch-changed", paths: ["src/a.test.ts", "src/b.test.ts"] })).toEqual([
      "`src/a.test.ts` no está como se bloqueó.",
      "`src/b.test.ts` no está como se bloqueó.",
      "El parche se comprueba sobre la versión que aprobó la persona: vuelve a dejar el test así.",
    ]);
  });

  it("AC3 AC8: says it in English too", () => {
    expect(lines({ reason: "patch-unreadable", file: "fix.patch" }, EN)).toEqual([
      "The patch `fix.patch` cannot be read.",
    ]);
    expect(lines({ reason: "patch-too-long", lines: 501 }, EN)).toEqual([
      "The patch has 501 lines, and the limit is 500.",
    ]);
    expect(lines({ reason: "patch-invalid", detail: "error: x" }, EN)).toEqual([
      'The patch is not a unified diff: `git apply` says "error: x".',
    ]);
    expect(lines({ reason: "patch-other-files", paths: ["src/app.ts"] }, EN)).toEqual([
      "The patch touches files that are not the tests you ask to unlock: src/app.ts.",
    ]);
    expect(lines({ reason: "patch-not-applying", detail: "error: x" }, EN)).toEqual([
      'The patch does not apply to the locked version of the test: `git apply` says "error: x".',
    ]);
    expect(lines({ reason: "patch-changed", paths: ["src/a.test.ts"] }, EN)).toEqual([
      "`src/a.test.ts` is not as it was locked.",
      "The patch is checked against the version the person approved: put the test back that way.",
    ]);
    expect(
      unlockRefusalCard({ reason: "patch-too-long", lines: 501 }, ASKED, HEADER, EN).next,
    ).toBe(`fix it and ask again with ${FULL_EN}.`);
  });
});

describe("evidence that does not do", () => {
  it("AC4: says which and why", () => {
    const cases: readonly (readonly [UnlockRefusal, string])[] = [
      [{ reason: "evidence-too-many", count: 6 }, "Hay 6 `--evidence`, y el máximo es 5."],
      [
        { reason: "evidence-format", evidence: "src/app.ts" },
        "`src/app.ts` no es una evidencia: escríbela como `<ruta>:<desde>-<hasta>`, con la primera línea antes que la última.",
      ],
      [
        { reason: "evidence-too-long", evidence: "src/app.ts:1-41", lines: 41 },
        "`src/app.ts:1-41` tiene 41 líneas, y el máximo es 40.",
      ],
      [
        { reason: "evidence-untracked", evidence: ".env:1-2", path: ".env" },
        "`.env:1-2`: git no sigue `.env`, y la evidencia solo sale de archivos que git sigue, nunca de uno ignorado.",
      ],
      [
        { reason: "evidence-lines", evidence: "src/app.ts:1-3", path: "src/app.ts", lines: 1 },
        "`src/app.ts:1-3` no existe: `src/app.ts` tiene 1 línea.",
      ],
      [
        { reason: "evidence-lines", evidence: "src/app.ts:9-9", path: "src/app.ts", lines: 4 },
        "`src/app.ts:9-9` no existe: `src/app.ts` tiene 4 líneas.",
      ],
    ];
    for (const [refusal, line] of cases) {
      const card = unlockRefusalCard(refusal, ASKED, HEADER, ES);
      expect(card.status, refusal.reason).toBe("invalid");
      expect(card.blocks[0]?.lines, refusal.reason).toEqual([line]);
      expect(card.next, refusal.reason).toBe(`corrígelo y vuelve a pedirlo con ${FULL_ES}.`);
    }
  });

  it("AC4 AC8: says it in English too", () => {
    expect(lines({ reason: "evidence-too-many", count: 6 }, EN)).toEqual([
      "There are 6 `--evidence`, and the limit is 5.",
    ]);
    expect(lines({ reason: "evidence-format", evidence: "src/app.ts" }, EN)).toEqual([
      "`src/app.ts` is not evidence: write it as `<path>:<from>-<to>`, with the first line before the last.",
    ]);
    expect(lines({ reason: "evidence-too-long", evidence: "a.ts:1-41", lines: 41 }, EN)).toEqual([
      "`a.ts:1-41` has 41 lines, and the limit is 40.",
    ]);
    expect(lines({ reason: "evidence-untracked", evidence: ".env:1-2", path: ".env" }, EN)).toEqual(
      [
        "`.env:1-2`: git does not track `.env`, and evidence only comes from files git tracks, never from an ignored one.",
      ],
    );
    expect(
      lines({ reason: "evidence-lines", evidence: "a.ts:1-3", path: "a.ts", lines: 1 }, EN),
    ).toEqual(["`a.ts:1-3` does not exist: `a.ts` has 1 line."]);
  });
});

describe("--patch or --evidence without an unlock", () => {
  it("AC6: says they are only for unlocking, and how to ask without them", () => {
    const asked = { task: "T1", paths: ["lib/other.ts"] };
    const es = unlockRefusalCard({ reason: "not-unlock" }, asked, HEADER, ES);
    expect(es.status).toBe("invalid");
    expect(es.blocks[0]?.lines).toEqual([
      "`--patch` y `--evidence` son solo para desbloquear un test aprobado, y ninguna de esas rutas lo es.",
    ]);
    expect(es.next).toBe(
      'pídelo sin ellos: `specty scope add lib/other.ts --task T1 --reason "<motivo>"`.',
    );
    // AC8: and in English.
    const en = unlockRefusalCard({ reason: "not-unlock" }, asked, HEADER, EN);
    expect(en.blocks[0]?.lines).toEqual([
      "`--patch` and `--evidence` are only for unlocking an approved test, and none of those paths is one.",
    ]);
    expect(en.next).toBe(
      'ask for it without them: `specty scope add lib/other.ts --task T1 --reason "<reason>"`.',
    );
  });
});
