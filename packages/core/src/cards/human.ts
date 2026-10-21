// SPDX-License-Identifier: Apache-2.0
import type { Phase, WaitingFor } from "../flow/phases";
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

/** A human decision was recorded; the agent continues when the user says so. */
export function decisionCard(header: string, lines: readonly string[], ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header,
    blocks: section(undefined, lines),
    next: t(
      `dile a tu agente «continúa»; ejecutará \`${ctx.command} next\`.`,
      `tell your agent "continue"; it will run \`${ctx.command} next\`.`,
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

export interface StatusEntry {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly phase: Phase;
  readonly title: string;
  readonly waitingFor: WaitingFor;
  readonly current: boolean;
  readonly pendingScope: readonly string[];
}

export function statusCard(entries: readonly StatusEntry[], ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const who = { agent: t("el agente", "the agent"), human: t("ti", "you"), nobody: "—" };
  const lines = entries.map((entry) => {
    const marker = entry.current ? "▸" : " ";
    const scope =
      entry.pendingScope.length === 0
        ? ""
        : t(
            ` · alcance: ${entry.pendingScope.join(", ")}`,
            ` · scope: ${entry.pendingScope.join(", ")}`,
          );
    return `${marker} ${entry.id} · ${entry.kind} · ${entry.phase} · ${t("espera a", "waits for")} ${who[entry.waitingFor]}${scope} — ${entry.title}`;
  });
  const waiting = entries.find((entry) => entry.current && entry.waitingFor === "human");
  return {
    status: "ok",
    header: headerOf(t("estado", "status")),
    blocks: section(
      t("CAMBIOS ABIERTOS", "OPEN CHANGES"),
      lines.length > 0 ? lines : [t("Ninguno.", "None.")],
    ),
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
