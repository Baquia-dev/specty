// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  renderText,
  type UnlockMismatch,
  unlockMismatchCard,
  unlockStaleCard,
  unlockStaleReason,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const HEADER = "SPECTY · 20261106-saludo · implementing";
const PATH = "src/app.test.ts";
const DIFF = [
  "@@ -1 +1 @@",
  "-it('AC1: saluda a Ana', () => {}); // Hola, Ana",
  "+it('AC1: saluda a Ana', () => {}); // Hola",
];
const DIFFERENT: UnlockMismatch = { kind: "different", path: PATH, request: "S1", diff: DIFF };

const FULL_ES =
  '`specty scope add src/app.test.ts --task T1 --reason "<motivo>" --patch <parche> --evidence <ruta>:<desde>-<hasta>`';
const FULL_EN =
  '`specty scope add src/app.test.ts --task T1 --reason "<reason>" --patch <patch> --evidence <path>:<from>-<to>`';

/** The lines of the card for `mismatches`, in `ctx`'s language. */
const lines = (mismatches: readonly UnlockMismatch[], ctx: CardContext = ES) =>
  unlockMismatchCard(mismatches, "T1", HEADER, ctx).blocks.flatMap((block) => block.lines);

describe("a test that is not as its approved patch leaves it", () => {
  it("AC1: blocks the task, shows the difference and says to follow the patch or ask for another unlock", () => {
    const card = unlockMismatchCard([DIFFERENT], "T1", HEADER, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        HEADER,
        "`src/app.test.ts` no quedó como lo deja el parche aprobado en S1.",
        "En cada diferencia, `-` es como lo deja el parche y `+`, como está.",
        "DIFERENCIA CON EL PARCHE DE S1 (src/app.test.ts):",
        ...DIFF.map((line) => `  ${line}`),
        `SIGUIENTE: deja cada test como lo deja su parche y vuelve a ejecutar \`specty task done T1\`. Si el parche no basta, vuelve a dejar el test como se bloqueó (\`git show HEAD:<ruta>\`) y pide otro desbloqueo con el cambio completo, que sustituye al anterior: ${FULL_ES}.`,
      ].join("\n"),
    );
  });

  it("AC1 AC9: says it in English too", () => {
    expect(renderText(unlockMismatchCard([DIFFERENT], "T1", HEADER, EN), "en")).toBe(
      [
        HEADER,
        "`src/app.test.ts` is not as the patch approved in S1 leaves it.",
        "In each difference, `-` is how the patch leaves it and `+`, how it is.",
        "DIFFERENCE FROM THE PATCH OF S1 (src/app.test.ts):",
        ...DIFF.map((line) => `  ${line}`),
        `NEXT: leave each test as its patch leaves it and run \`specty task done T1\` again. If the patch is not enough, put the test back as it was locked (\`git show HEAD:<path>\`) and ask for another unlock with the whole change, which replaces the previous one: ${FULL_EN}.`,
      ].join("\n"),
    );
  });

  it("AC1: shows 40 lines of a long difference and says how many it leaves out", () => {
    const long = Array.from({ length: 45 }, (_, index) => `+línea ${index + 1}`);
    const shown = (ctx: CardContext) =>
      unlockMismatchCard([{ ...DIFFERENT, diff: long }], "T1", HEADER, ctx).blocks[1]?.lines;
    expect(shown(ES)).toEqual([...long.slice(0, 40), "… y 5 líneas más"]);
    expect(shown(EN)).toEqual([...long.slice(0, 40), "… and 5 more lines"]);
    const one = unlockMismatchCard([{ ...DIFFERENT, diff: long.slice(0, 41) }], "T1", HEADER, ES);
    expect(one.blocks[1]?.lines.at(-1)).toBe("… y 1 línea más");
    expect(one.blocks[1]?.lines).toHaveLength(41);
  });

  it("AC1: names every test once in the command that asks for another unlock", () => {
    const other: UnlockMismatch = { kind: "kept", path: "src/b.test.ts", request: "S2" };
    expect(unlockMismatchCard([DIFFERENT, other], "T1", HEADER, ES).next).toContain(
      '`specty scope add src/app.test.ts src/b.test.ts --task T1 --reason "<motivo>"',
    );
  });
});

describe("a test the patch deletes, or keeps", () => {
  it("AC3 AC9: says which one, in Spanish and in English, and shows no difference", () => {
    const kept: UnlockMismatch = { kind: "kept", path: PATH, request: "S1" };
    const missing: UnlockMismatch = { kind: "missing", path: PATH, request: "S2" };
    expect(lines([kept, missing])).toEqual([
      "`src/app.test.ts` sigue ahí, y el parche aprobado en S1 lo borra.",
      "`src/app.test.ts` ya no está, y el parche aprobado en S2 no lo borra.",
    ]);
    expect(lines([kept, missing], EN)).toEqual([
      "`src/app.test.ts` is still there, and the patch approved in S1 deletes it.",
      "`src/app.test.ts` is gone, and the patch approved in S2 does not delete it.",
    ]);
    const card = unlockMismatchCard([kept], "T1", HEADER, ES);
    expect(card.status).toBe("blocked");
    expect(card.next).toContain("vuelve a ejecutar `specty task done T1`");
  });
});

describe("a test Specty cannot check", () => {
  it("AC6 AC9: says why, and asks to stop and explain it to the user", () => {
    const unverifiable: UnlockMismatch = { kind: "unverifiable", path: PATH, request: "S1" };
    const card = unlockMismatchCard([unverifiable, DIFFERENT], "T1", HEADER, ES);
    expect(card.status).toBe("blocked");
    expect(card.blocks[0]?.lines[0]).toBe(
      "Specty no puede comprobar `src/app.test.ts`: su versión en el último commit no es la que se bloqueó.",
    );
    expect(card.next).toBe(
      "para y explícaselo al usuario: Specty no completa T1 sin comprobar cada test desbloqueado sobre su versión bloqueada.",
    );
    const english = unlockMismatchCard([unverifiable], "T1", HEADER, EN);
    expect(english.blocks[0]?.lines).toEqual([
      "Specty cannot check `src/app.test.ts`: its version in the last commit is not the one that was locked.",
    ]);
    expect(english.next).toBe(
      "stop and explain it to the user: Specty does not complete T1 without checking each unlocked test against its locked version.",
    );
  });

  it("AC6 AC9: with what git apply says when the patch does not apply", () => {
    const failed: UnlockMismatch = {
      kind: "unverifiable",
      path: PATH,
      request: "S1",
      detail: "error: patch failed: src/app.test.ts:1",
    };
    expect(lines([failed])).toEqual([
      "Specty no puede comprobar `src/app.test.ts`: el parche aprobado en S1 no se aplica a su versión bloqueada, y `git apply` dice «error: patch failed: src/app.test.ts:1».",
    ]);
    expect(lines([failed], EN)).toEqual([
      'Specty cannot check `src/app.test.ts`: the patch approved in S1 does not apply to its locked version, and `git apply` says "error: patch failed: src/app.test.ts:1".',
    ]);
  });
});

describe("an unlock whose patch no longer holds when it is approved", () => {
  it("AC8 AC9: Specty rejects it, says why to the person and keeps the reason", () => {
    const changed = { reason: "patch-changed", paths: [PATH] } as const;
    const card = unlockStaleCard(HEADER, "S1", changed, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        HEADER,
        "`src/app.test.ts` no está como se bloqueó.",
        "El parche se comprueba sobre la versión que aprobó la persona: vuelve a dejar el test así.",
        "Specty rechazó S1: su parche ya no vale para la versión bloqueada del test.",
        "SIGUIENTE: pídele a tu agente que deje el test como se bloqueó y vuelva a pedir el desbloqueo.",
      ].join("\n"),
    );
    expect(renderText(unlockStaleCard(HEADER, "S1", changed, EN), "en")).toBe(
      [
        HEADER,
        "`src/app.test.ts` is not as it was locked.",
        "The patch is checked against the version the person approved: put the test back that way.",
        "Specty rejected S1: its patch no longer holds for the locked version of the test.",
        "NEXT: ask your agent to put the test back as it was locked and ask for the unlock again.",
      ].join("\n"),
    );
    const failed = { reason: "patch-not-applying", detail: "error: patch failed" } as const;
    expect(unlockStaleReason(failed, "es")).toBe(
      "Su parche ya no valía al aprobarla. El parche no se aplica a la versión bloqueada del test: `git apply` dice «error: patch failed».",
    );
    expect(unlockStaleReason(failed, "en")).toBe(
      'Its patch no longer held when it was approved. The patch does not apply to the locked version of the test: `git apply` says "error: patch failed".',
    );
  });
});
