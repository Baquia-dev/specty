// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeKind,
  type ChangeView,
  closingInAcceptance,
  DEFAULT_CONFIG,
  decideGuard,
  type GuardChange,
  type GuardContext,
  nextCard,
  phasePermissions,
  renderText,
  type TaskView,
  transition,
} from "../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const delegated = (ctx: CardContext): CardContext => ({ ...ctx, delegated: true });

const SPEC = ".specty/changes/20261107-x/spec.md";

/** The change in acceptance as the guard judges it. */
const inAcceptance = (kind: ChangeKind = "standard"): GuardChange => ({
  id: "20261107-x",
  kind,
  phase: "acceptance",
  closingSubmitted: false,
  specPath: SPEC,
});
const guard = (change: GuardChange, on: boolean): GuardContext => ({
  config: DEFAULT_CONFIG,
  lang: "es",
  command: "specty",
  change,
  ...(on ? { delegated: true } : {}),
});
const writes = (context: GuardContext) =>
  decideGuard({ kind: "write", paths: [SPEC] }, context).allow;
const deletes = (context: GuardContext) =>
  decideGuard({ kind: "delete", paths: [SPEC] }, context).allow;

const done: TaskView = {
  id: "T1",
  title: "Tarea T1",
  status: "done",
  files: ["src/a.ts"],
  extras: [],
  criteria: [],
  effort: "medium",
  summary: "Hecho",
  findings: ["La caché no se invalida al cambiar de curso."],
};

const view = (extra: Partial<ChangeView> = {}): ChangeView => ({
  id: "20261107-x",
  kind: "standard",
  phase: "acceptance",
  title: "X",
  specPath: SPEC,
  revision: 1,
  tasks: [done],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
  ...extra,
});
const card = (change: ChangeView, ctx: CardContext) => nextCard({ change, dirty: [] }, ctx);

const HOW_ES = `CÓMO CERRAR:\n  Añade al final de ${SPEC} la sección «## Cierre» con ### Resumen, ### Desviaciones (respecto al plan), ### Decisiones y ### Pendientes.\n  No cambies nada más de la spec.`;
const HOW_EN = `HOW TO CLOSE:\n  Add a "## Closing" section at the end of ${SPEC} with ### Summary, ### Deviations (from the plan), ### Decisions and ### Follow-ups.\n  Do not change anything else in the spec.`;
const FINDINGS_ES =
  "HALLAZGOS DE LAS TAREAS:\n  T1: La caché no se invalida al cambiar de curso.\n  Lleva a ### Pendientes los que sigan abiertos: un cambio que siga a este con `--follows` los verá.";

const WRITE_ES =
  'modo delegado: escribe tú el cierre antes de aceptar: añade la sección «## Cierre» como dice CÓMO CERRAR y envíala con `specty propose`; después acepta el resultado con `specty accept`, que lo acepta, lo cierra y lo aterriza en un solo paso, y sigue su salida. Si el usuario pide ajustes, ejecuta `specty adjust "<petición literal>"`.';
const WRITE_EN =
  'delegated mode: write the closing yourself before accepting: add the "## Closing" section as HOW TO CLOSE says and send it with `specty propose`; then accept the result with `specty accept`, which accepts, closes and lands it in a single step, and follow its output. If the user asks for adjustments, run `specty adjust "<literal request>"`.';
const SENT_ES =
  'modo delegado: acepta tú el resultado con `specty accept`: con el cierre ya enviado, lo acepta, lo cierra y lo aterriza en un solo paso; sigue su salida. Si el cierre debe cambiar, corrígelo y envíalo otra vez con `specty propose`. Si el usuario pide ajustes, ejecuta `specty adjust "<petición literal>"`.';
const SENT_EN =
  'delegated mode: accept the result yourself with `specty accept`: with the closing already sent, it accepts, closes and lands it in a single step; follow its output. If the closing must change, fix it and send it again with `specty propose`. If the user asks for adjustments, run `specty adjust "<literal request>"`.';

describe("the closing written in acceptance, in delegated mode", () => {
  it("AC1: applies to the changes with a closing of their own, and only in delegated mode", () => {
    expect(closingInAcceptance("standard", true)).toBe(true);
    expect(closingInAcceptance("spike", true)).toBe(true);
    expect(closingInAcceptance("quick", true)).toBe(false);
    expect(closingInAcceptance("epic", true)).toBe(false);
    expect(closingInAcceptance("standard", false)).toBe(false);
  });

  it("AC1: opens only the Closing section of the spec in acceptance, as in closing", () => {
    expect(phasePermissions("acceptance", false, false, true)).toEqual({
      code: "blocked",
      spec: "closing-only",
      waitingFor: "human",
    });
    expect(phasePermissions("acceptance", true, false, true).spec).toBe("closing-only");
  });

  it("AC1: lets the agent write the spec, never delete it", () => {
    for (const kind of ["standard", "spike"] as const) {
      expect(writes(guard(inAcceptance(kind), true))).toBe(true);
      expect(deletes(guard(inAcceptance(kind), true))).toBe(false);
    }
  });

  it("AC1: keeps the spec locked for a quick change and an epic, also in delegated mode", () => {
    for (const kind of ["quick", "epic"] as const) {
      expect(
        decideGuard({ kind: "write", paths: [SPEC] }, guard(inAcceptance(kind), true)),
      ).toEqual(expect.objectContaining({ allow: false, rule: "spec" }));
    }
  });

  it("AC1: a proposal in acceptance keeps the change in acceptance", () => {
    expect(
      transition({
        phase: "acceptance",
        kind: "standard",
        actor: "agent",
        event: { type: "propose", validationErrors: 0 },
      }),
    ).toEqual({ ok: true, phase: "acceptance" });
  });

  it("AC5: without delegated mode, the spec stays locked in acceptance", () => {
    expect(phasePermissions("acceptance").spec).toBe("locked");
    expect(phasePermissions("acceptance", false, false, false).spec).toBe("locked");
    const denied = decideGuard({ kind: "write", paths: [SPEC] }, guard(inAcceptance(), false));
    expect(denied).toEqual(
      expect.objectContaining({
        allow: false,
        rule: "spec",
        reason: "La spec está bloqueada en la fase acceptance.",
      }),
    );
  });

  it("AC1: the acceptance card asks for the closing, its propose and then accept", () => {
    const output = card(view(), delegated(ES));
    expect(output.next).toBe(WRITE_ES);
    const text = renderText(output, "es");
    expect(text).toContain(HOW_ES);
    expect(text).toContain(FINDINGS_ES);
    expect(text).toContain("TAREAS HECHAS:\n  T1 Hecho");
  });

  it("AC1: with the closing sent, the card asks for accept and no longer for the closing", () => {
    const output = card(view({ closingSubmitted: true }), delegated(ES));
    expect(output.next).toBe(SENT_ES);
    expect(renderText(output, "es")).not.toContain("CÓMO CERRAR");
  });

  it("AC1: an independent review still comes first", () => {
    const output = card(view({ recommendReview: true }), delegated(ES));
    expect(output.next).toContain("`specty review`");
    expect(output.next).not.toContain("`specty propose`");
  });

  it("AC5: without delegated mode, or for a quick change, the acceptance card is as before", () => {
    expect(card(view(), ES).next).toContain("pide al usuario que revise el resultado");
    expect(renderText(card(view(), ES), "es")).not.toContain("CÓMO CERRAR");
    const quick = card(view({ kind: "quick" }), delegated(ES));
    expect(quick.next).toBe(
      'modo delegado: acepta tú el resultado con `specty accept` y sigue su salida. Si el usuario pide ajustes, ejecuta `specty adjust "<petición literal>"`.',
    );
    expect(renderText(quick, "es")).not.toContain("CÓMO CERRAR");
  });

  it("AC6: says it all in English too", () => {
    const output = card(view(), delegated(EN));
    expect(output.next).toBe(WRITE_EN);
    expect(renderText(output, "en")).toContain(HOW_EN);
    expect(card(view({ closingSubmitted: true }), delegated(EN)).next).toBe(SENT_EN);
  });
});

const ACCEPT_ES =
  'modo delegado: acepta tú el resultado con `specty accept` y sigue su salida. Si el usuario pide ajustes, ejecuta `specty adjust "<petición literal>"`.';
const ACCEPT_EN =
  'delegated mode: accept the result yourself with `specty accept` and follow its output. If the user asks for adjustments, run `specty adjust "<literal request>"`.';

describe("a standard change without its closing phase (flow.closing: false)", () => {
  /** The person accepts a change of `kind`, with or without its closing phase. */
  const accepted = (kind: ChangeKind, withoutClosing?: boolean) =>
    transition({
      phase: "acceptance",
      kind,
      actor: "human",
      event: { type: "accept", ...(withoutClosing === undefined ? {} : { withoutClosing }) },
    });

  it("AC1: with its closing phase, accepting a standard change takes it to closing, and the delegated card asks for the closing first", () => {
    expect(accepted("standard")).toEqual({ ok: true, phase: "closing" });
    expect(accepted("standard", false)).toEqual({ ok: true, phase: "closing" });
    const output = card(view({ withoutClosing: false }), delegated(ES));
    expect(output.next).toBe(WRITE_ES);
    expect(renderText(output, "es")).toContain(HOW_ES);
  });

  it("AC3: without it, accepting a standard change leaves it done, and the delegated card asks to accept with no closing first", () => {
    expect(accepted("standard", true)).toEqual({ ok: true, phase: "done" });
    const output = card(view({ withoutClosing: true }), delegated(ES));
    expect(output.next).toBe(ACCEPT_ES);
    expect(renderText(output, "es")).not.toContain("CÓMO CERRAR");
    const english = card(view({ withoutClosing: true }), delegated(EN));
    expect(english.next).toBe(ACCEPT_EN);
    expect(renderText(english, "en")).not.toContain("HOW TO CLOSE");
    // The person's card is as before.
    expect(card(view({ withoutClosing: true }), ES).next).toContain(
      "pide al usuario que revise el resultado",
    );
  });

  it("AC4: a spike and an epic still go to closing, and a quick change to done, with or without it", () => {
    for (const kind of ["spike", "epic"] as const) {
      expect(accepted(kind, true), kind).toEqual({ ok: true, phase: "closing" });
    }
    expect(accepted("quick", true)).toEqual({ ok: true, phase: "done" });
    expect(accepted("quick")).toEqual({ ok: true, phase: "done" });
  });
});
