// SPDX-License-Identifier: Apache-2.0
import type { Phase, WaitingFor } from "../flow/phases";
import type { Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import type { ChangeKind } from "../spec/model";
import { translator } from "./text";
import type { CardContext } from "./view";

/** Messages for people: approvals, acceptance, closing, cancellation and status. */

export function notInteractiveCard(action: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "blocked",
    header: headerOf(),
    blocks: section(undefined, [
      t(
        `\`${ctx.command} ${action}\` lo ejecuta una persona en su terminal; un agente no puede ejecutarlo.`,
        `\`${ctx.command} ${action}\` is run by a person in their terminal; an agent cannot run it.`,
      ),
    ]),
    next: t(
      "pídele al usuario que lo ejecute en su terminal.",
      "ask the user to run it in their terminal.",
    ),
  };
}

export function nothingPendingCard(
  id: string,
  phase: Phase,
  action: string,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return {
    status: "blocked",
    header: headerOf(id, phase),
    blocks: section(undefined, [
      t(
        `No hay nada pendiente de \`${action}\` en la fase ${phase}.`,
        `Nothing is waiting for \`${action}\` in the ${phase} phase.`,
      ),
    ]),
    next: t(
      `revisa el estado con \`${ctx.command} status\`.`,
      `check the state with \`${ctx.command} status\`.`,
    ),
  };
}

/**
 * A human decision was recorded; the agent continues when the user says so. In delegated mode the
 * agent usually took it, and the line reads right for whoever runs the command.
 */
export function decisionCard(header: string, lines: readonly string[], ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header,
    blocks: section(undefined, lines),
    next:
      ctx.delegated === true
        ? t(`sigue con \`${ctx.command} next\`.`, `continue with \`${ctx.command} next\`.`)
        : t(
            `dile a tu agente «continúa»; ejecutará \`${ctx.command} next\`.`,
            `tell your agent "continue"; it will run \`${ctx.command} next\`.`,
          ),
  };
}

/** What delegated mode lets the agent do, shown to the person before they confirm it (ADR 0010). */
export function delegationWarning(ctx: CardContext): readonly string[] {
  const t = translator(ctx.lang);
  return [
    t(
      "Con el modo delegado, tu agente toma sin preguntarte las decisiones que hoy son solo tuyas:",
      "In delegated mode, your agent makes the decisions that today are only yours, without asking you:",
    ),
    t(
      "- aprueba specs y confirma sus supuestos de impacto alto;",
      "- it approves specs and confirms their high-impact assumptions;",
    ),
    t(
      "- aprueba o rechaza ampliaciones de alcance, también en rutas sensibles;",
      "- it approves or rejects scope extensions, sensitive paths included;",
    ),
    t(
      "- acepta los resultados que pasan la verificación completa;",
      "- it accepts the results that pass the full verification;",
    ),
    t(
      "- cierra cambios y los incorpora a la rama principal, y cancela cambios.",
      "- it closes changes and merges them into the main branch, and cancels changes.",
    ),
    t(
      "Specty deja de garantizar que una persona revise cada spec y cada resultado. La auditoría registra cada una de esas acciones como del agente, por delegación.",
      "Specty no longer guarantees that a person reviews every spec and every result. The audit log records each of those actions as the agent's, by delegation.",
    ),
    t(
      `Vale para este clon y todas sus worktrees hasta que ejecutes \`${ctx.command} delegate off\`.`,
      `It applies to this clone and all its worktrees until you run \`${ctx.command} delegate off\`.`,
    ),
  ];
}

/** `specty delegate on|off`: the position the switch is in now. */
export function delegationCard(on: boolean, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf(t("modo delegado", "delegated mode")),
    blocks: section(undefined, [
      on
        ? t(
            "Modo delegado activado: tu agente aprueba, decide el alcance, acepta, cierra y cancela por ti.",
            "Delegated mode on: your agent approves, decides scope, accepts, closes and cancels for you.",
          )
        : t(
            "Modo delegado desactivado: aprobar, decidir el alcance, aceptar, cerrar y cancelar vuelven a ser solo tuyos.",
            "Delegated mode off: approving, deciding scope, accepting, closing and cancelling are yours alone again.",
          ),
    ]),
    next: on
      ? t(
          `dile a tu agente «continúa»; ejecutará \`${ctx.command} next\`.`,
          `tell your agent "continue"; it will run \`${ctx.command} next\`.`,
        )
      : t(
          `revisa \`${ctx.command} status\` cuando quieras decidir.`,
          `check \`${ctx.command} status\` when you want to decide.`,
        ),
  };
}

export function closedCard(
  header: string,
  lead: string,
  branch: string | undefined,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header,
    blocks: section(undefined, [lead]),
    next:
      branch === undefined
        ? t(
            `para otro cambio, \`${ctx.command} new "<título>"\`.`,
            `for another change, \`${ctx.command} new "<title>"\`.`,
          )
        : t(
            `fusiona la rama ${branch} (o abre un PR); para otro cambio, \`${ctx.command} new "<título>"\`.`,
            `merge branch ${branch} (or open a PR); for another change, \`${ctx.command} new "<title>"\`.`,
          ),
  };
}

/**
 * A cancelled change: its branch is never merged, because it may hold half-done code. The card
 * says what the branch keeps and only offers another change.
 */
export function cancelledCard(
  header: string,
  lead: string,
  branch: { readonly name: string; readonly withCode: boolean } | undefined,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const kept =
    branch === undefined
      ? []
      : [
          branch.withCode
            ? t(
                `La rama ${branch.name} guarda la spec, su registro y el código de las tareas hechas; no se incorpora, porque llevaría ese código a medias.`,
                `Branch ${branch.name} keeps the spec, its record and the code of the done tasks; it is not merged, as it would bring that half-done code.`,
              )
            : t(
                `La rama ${branch.name} guarda la spec y su registro; no se incorpora.`,
                `Branch ${branch.name} keeps the spec and its record; it is not merged.`,
              ),
        ];
  return {
    ...closedCard(header, lead, undefined, ctx),
    blocks: section(undefined, [lead, ...kept]),
  };
}

export interface StatusEntry {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly phase: Phase;
  readonly title: string;
  readonly waitingFor: WaitingFor;
  readonly current: boolean;
  readonly pendingScope: readonly string[];
  /** Where the change lives, relative to this folder, when it is not this folder. */
  readonly folder?: string;
}

/** Open changes of every worktree; a person's decision can be taken from any folder. */
export function statusCard(entries: readonly StatusEntry[], ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const who = {
    agent: t("al agente", "the agent"),
    human: t("a ti", "you"),
    nobody: t("a —", "—"),
  };
  const lines = entries.map((entry) => {
    const marker = entry.current ? "▸" : " ";
    const scope =
      entry.pendingScope.length === 0
        ? ""
        : t(
            ` · alcance: ${entry.pendingScope.join(", ")}`,
            ` · scope: ${entry.pendingScope.join(", ")}`,
          );
    const where = entry.folder === undefined ? "" : ` · ${t("en", "in")} ${entry.folder}`;
    return `${marker} ${entry.id} · ${entry.kind} · ${entry.phase} · ${t("espera", "waits for")} ${who[entry.waitingFor]}${scope} — ${entry.title}${where}`;
  });
  const waiting =
    entries.find((entry) => entry.current && entry.waitingFor === "human") ??
    entries.find((entry) => entry.waitingFor === "human");
  return {
    status: "ok",
    header: headerOf(t("estado", "status")),
    blocks: [
      ...section(
        t("CAMBIOS ABIERTOS", "OPEN CHANGES"),
        lines.length > 0 ? lines : [t("Ninguno.", "None.")],
      ),
      ...section(
        t("MODO DELEGADO", "DELEGATED MODE"),
        ctx.delegated === true
          ? [
              t(
                `Tu agente toma tus decisiones: aprueba, decide el alcance, acepta, cierra y cancela. Para desactivarlo: \`${ctx.command} delegate off\`.`,
                `Your agent makes your decisions: it approves, decides scope, accepts, closes and cancels. To turn it off: \`${ctx.command} delegate off\`.`,
              ),
            ]
          : [],
      ),
    ],
    next:
      waiting === undefined
        ? t(
            `pídele a tu agente que continúe con \`${ctx.command} next\`.`,
            `ask your agent to continue with \`${ctx.command} next\`.`,
          )
        : t(
            `te toca decidir en ${waiting.id}: \`${ctx.command} ${humanAction(waiting.phase)}\`.`,
            `${waiting.id} waits for your decision: \`${ctx.command} ${humanAction(waiting.phase)}\`.`,
          ),
  };
}

function humanAction(phase: Phase): string {
  switch (phase) {
    case "review":
      return "approve";
    case "acceptance":
      return "accept";
    case "closing":
      return "close";
    default:
      return "approve --scope <S>";
  }
}

/** The title of the note with delegated mode's warning, before its question. */
export function delegationNoteTitle(lang: Lang): string {
  return translator(lang)("Modo delegado", "Delegated mode");
}

export function delegationQuestion(lang: Lang): string {
  return translator(lang)("¿Activar el modo delegado?", "Turn delegated mode on?");
}

/** The answers to `delegationQuestion`: the first, deciding yourself, is the default. */
export function delegationChoices(
  lang: Lang,
): readonly { readonly value: "no" | "yes"; readonly label: string }[] {
  const t = translator(lang);
  return [
    { value: "no", label: t("No, sigo decidiendo yo", "No, I keep deciding") },
    { value: "yes", label: t("Sí, que decida mi agente", "Yes, let my agent decide") },
  ];
}
