// SPDX-License-Identifier: Apache-2.0
import type { Phase, WaitingFor } from "../flow/phases";
import { isOpenEntry, type MemoryEntry } from "../memory/entries";
import { headerOf, type Output, section } from "../output";
import type { ChangeKind } from "../spec/model";
import type { FrontsView } from "./fronts";
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
  /**
   * It waits for the agent, nobody stepped in its folder lately, and the conversation bound to
   * that folder stepped last in another one: its agent, and how many minutes ago.
   */
  readonly away?: { readonly tool: string; readonly ago: number };
  /** The messages left for its session that it has not taken yet, when there are any. */
  readonly messages?: number;
  /** Its folder is gone and its branch is still there: `specty restore` brings the folder back. */
  readonly lost?: boolean;
}

/** A front of the memory in `status`: its open entries in order, and its live owner. */
interface StatusFront {
  readonly name: string;
  readonly open: readonly string[];
  readonly owner?: { readonly tool: string; readonly ago: number };
}

/**
 * `specty status`'s card, with the open changes, the fronts and delegated mode as data too:
 * `--json` prints them, and the VS Code extension reads them.
 */
interface StatusOutput extends Output {
  readonly changes: readonly StatusEntry[];
  readonly fronts: readonly StatusFront[];
  readonly delegated: boolean;
}

/**
 * Open changes of every worktree; a person's decision can be taken from any folder. «FRENTES»
 * lists the memory's fronts with who holds each, «TE TOCA» its open reminders (ADR 0016), and
 * «LIMPIEZA» how many `orphans` the clean-up of `prune` removes; each is left out when there are
 * none.
 */
export function statusCard(
  entries: readonly StatusEntry[],
  ctx: CardContext,
  memory: readonly MemoryEntry[] = [],
  view: FrontsView = { fronts: [], owners: [] },
  orphans = 0,
): StatusOutput {
  const t = translator(ctx.lang);
  const lines = entries.map((entry) => statusLine(entry, t, ctx.command));
  const fronts = statusFronts(view, memory);
  return {
    status: "ok",
    header: headerOf(t("estado", "status")),
    blocks: [
      ...section(
        t("CAMBIOS ABIERTOS", "OPEN CHANGES"),
        lines.length > 0 ? lines : [t("Ninguno.", "None.")],
      ),
      ...section(
        t("FRENTES", "FRONTS"),
        fronts.map((front) => frontLine(front, t)),
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
      ...section(
        t("LIMPIEZA", "CLEAN-UP"),
        orphans > 0 ? [orphansLine(orphans, ctx.command, t)] : [],
      ),
    ],
    next: statusNext(entries, ctx),
    changes: entries,
    fronts,
    delegated: ctx.delegated === true,
  };
}

/** How many orphans the clean-up of `prune` removes (ARCHITECTURE §9); `doctor` says each kind. */
function orphansLine(count: number, command: string, t: Translate): string {
  return t(
    `Huérfanos que quita \`${command} prune\`: ${count} (registros de worktrees sin carpeta y carpetas que sobran); \`${command} doctor\` los cuenta por tipo.`,
    `Orphans \`${command} prune\` removes: ${count} (records of worktrees with no folder and leftover folders); \`${command} doctor\` counts them by kind.`,
  );
}

/** Each front with the ids of its open entries, in the front's order, and its live owner. */
function statusFronts(view: FrontsView, memory: readonly MemoryEntry[]): StatusFront[] {
  return view.fronts.map(({ name, items }) => {
    const owner = view.owners.find((known) => known.front === name);
    const open = items.filter((id) =>
      memory.some((entry) => entry.id === id && isOpenEntry(entry)),
    );
    return {
      name,
      open,
      ...(owner === undefined ? {} : { owner: { tool: owner.tool, ago: owner.ago } }),
    };
  });
}

/** A front in «FRENTES»: who holds it, or that it is free, and its open entries. */
function frontLine(front: StatusFront, t: Translate): string {
  const held = front.owner === undefined ? undefined : heldBy({ holder: front.owner }, t);
  const open =
    front.open.length === 0
      ? t("sin entradas abiertas", "no open entries")
      : `${t("abiertas", "open")}: ${front.open.join(", ")}`;
  return `${front.name} · ${held ?? t("libre", "free")} · ${open}`;
}

/** One open change: the one here marked, who it waits for, its pending scope and its folder. */
function statusLine(entry: StatusEntry, t: Translate, command: string): string {
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
  const held =
    entry.lost === true
      ? lostText(entry.id, t, command)
      : entry.away === undefined
        ? heldBy(entry, t)
        : awayText(entry.away, t, command);
  return `${marker} ${entry.id} · ${entry.kind} · ${entry.phase} · ${t("espera", "waits for")} ${who[entry.waitingFor]}${scope} — ${entry.title}${where}${held === undefined ? "" : ` · ${held}`}${messagesText(entry.messages, t)}`;
}

/** The messages waiting for the change's session, after a separator; nothing without any. */
function messagesText(messages: number | undefined, t: Translate): string {
  if (messages === undefined || messages === 0) return "";
  return messages === 1
    ? t(" · 1 mensaje espera", " · 1 message waiting")
    : t(` · ${messages} mensajes esperan`, ` · ${messages} messages waiting`);
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

/** The conversation of the change is outside its folder: `specty next` there tells it how to go back. */
function awayText(away: NonNullable<StatusEntry["away"]>, t: Translate, command: string): string {
  const when = ago(away.ago, t);
  return t(
    `fuera de su carpeta: ${away.tool} dio su último paso en otra carpeta ${when}; en esa conversación, \`${command} next\` dice cómo volver`,
    `outside its folder: ${away.tool} last stepped in another folder ${when}; in that conversation, \`${command} next\` tells how to go back`,
  );
}

/** The change's folder is gone: `restore` brings it back from its branch. */
function lostText(id: string, t: Translate, command: string): string {
  return t(
    `sin carpeta: se recupera desde su rama con \`${command} restore ${id}\``,
    `no folder: \`${command} restore ${id}\` brings it back from its branch`,
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
