// SPDX-License-Identifier: Apache-2.0
import type { Phase, WaitingFor } from "../flow/phases";
import type { MemoryEntry } from "../memory/entries";
import { headerOf, type Output, section } from "../output";
import type { ChangeKind } from "../spec/model";
import { reminderLines } from "./memory";
import { dropProposalLines } from "./memory-drop";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

/** `specty status`'s card: the open changes of every worktree and what waits for the person. */

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
  /** The agent whose session stepped last in the change's folder, and how many minutes ago. */
  readonly holder?: { readonly tool: string; readonly ago: number };
  /** It waits for the agent, and no session stepped in it nor wrote to it lately. */
  readonly orphan?: boolean;
}

/**
 * `specty status`'s card, with the open changes and delegated mode as data too: `--json` prints
 * them, and the VS Code extension reads them.
 */
interface StatusOutput extends Output {
  readonly changes: readonly StatusEntry[];
  readonly delegated: boolean;
}

/**
 * Open changes of every worktree; a person's decision can be taken from any folder. «TE TOCA»
 * lists the memory's open reminders, and is left out when there are none (ADR 0016).
 */
export function statusCard(
  entries: readonly StatusEntry[],
  ctx: CardContext,
  memory: readonly MemoryEntry[] = [],
): StatusOutput {
  const t = translator(ctx.lang);
  const lines = entries.map((entry) => statusLine(entry, t));
  return {
    status: "ok",
    header: headerOf(t("estado", "status")),
    blocks: [
      ...section(
        t("CAMBIOS ABIERTOS", "OPEN CHANGES"),
        lines.length > 0 ? lines : [t("Ninguno.", "None.")],
      ),
      ...section(t("TE TOCA", "YOUR TURN"), [
        ...dropProposalLines(memory, ctx),
        ...reminderLines(memory, ctx),
      ]),
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
    next: statusNext(entries, ctx),
    changes: entries,
    delegated: ctx.delegated === true,
  };
}

/** One open change: the one here marked, who it waits for, its pending scope and its folder. */
function statusLine(entry: StatusEntry, t: Translate): string {
  const who = {
    agent: t("al agente", "the agent"),
    human: t("a ti", "you"),
    nobody: t("a —", "—"),
  };
  const marker = entry.current ? "▸" : " ";
  const scope =
    entry.pendingScope.length === 0
      ? ""
      : t(
          ` · alcance: ${entry.pendingScope.join(", ")}`,
          ` · scope: ${entry.pendingScope.join(", ")}`,
        );
  const where = entry.folder === undefined ? "" : ` · ${t("en", "in")} ${entry.folder}`;
  const held = heldBy(entry, t);
  return `${marker} ${entry.id} · ${entry.kind} · ${entry.phase} · ${t("espera", "waits for")} ${who[entry.waitingFor]}${scope} — ${entry.title}${where}${held === undefined ? "" : ` · ${held}`}`;
}

/** Who holds the change and since when, or that it is an orphan; nothing when neither is known. */
export function heldBy(
  entry: Pick<StatusEntry, "holder" | "orphan">,
  t: Translate,
): string | undefined {
  const { holder } = entry;
  if (entry.orphan === true) {
    return holder === undefined
      ? t("huérfano: ninguna sesión lo lleva", "orphaned: no session holds it")
      : t(
          `huérfano: ${holder.tool} dio su último paso ${ago(holder.ago, t)}`,
          `orphaned: ${holder.tool} last stepped ${ago(holder.ago, t)}`,
        );
  }
  return holder === undefined
    ? undefined
    : t(
        `lo lleva ${holder.tool}, ${ago(holder.ago, t)}`,
        `held by ${holder.tool}, ${ago(holder.ago, t)}`,
      );
}

/** How long ago, from minutes: under a minute, minutes, hours up to two days, then days. */
export function ago(minutes: number, t: Translate): string {
  if (minutes < 1) return t("ahora mismo", "just now");
  const [count, unit] =
    minutes < 60
      ? [Math.floor(minutes), "min"]
      : minutes < 48 * 60
        ? [Math.floor(minutes / 60), "h"]
        : [Math.floor(minutes / (24 * 60)), "d"];
  return t(`hace ${count} ${unit}`, `${count} ${unit} ago`);
}

/** The person's decision, the one here first; with none, the agent goes on. */
function statusNext(entries: readonly StatusEntry[], ctx: CardContext): string {
  const t = translator(ctx.lang);
  const waiting =
    entries.find((entry) => entry.current && entry.waitingFor === "human") ??
    entries.find((entry) => entry.waitingFor === "human");
  return waiting === undefined
    ? t(
        `pídele a tu agente que continúe con \`${ctx.command} next\`.`,
        `ask your agent to continue with \`${ctx.command} next\`.`,
      )
    : t(
        `te toca decidir en ${waiting.id}: \`${ctx.command} ${humanAction(waiting.phase)}\`.`,
        `${waiting.id} waits for your decision: \`${ctx.command} ${humanAction(waiting.phase)}\`.`,
      );
}

function humanAction(phase: Phase): string {
  switch (phase) {
    case "review":
    case "testing":
      return "approve";
    case "acceptance":
      return "accept";
    case "closing":
      return "close";
    default:
      return "approve --scope <S>";
  }
}
