// SPDX-License-Identifier: Apache-2.0
import { isOpenEntry, type MemoryEntry } from "../memory/entries";
import { headerOf, type Output, section } from "../output";
import { firstLine } from "./memory";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// Dropping an entry of Specty's memory (ADR 0016): only the person drops one, from their
// terminal; an agent, in delegated mode too, only proposes it, and the person sees it in «TE TOCA».

/** Why `memory drop` or `memory keep` changes nothing. */
export type MemoryDropRefusal =
  | { readonly reason: "unknown"; readonly id: string }
  /** Done or dropped already. */
  | { readonly reason: "closed"; readonly entry: MemoryEntry }
  /** An open change took it: cancelling that change frees it. */
  | { readonly reason: "taken"; readonly entry: MemoryEntry; readonly change: string }
  | { readonly reason: "no-reason"; readonly id: string }
  /** `keep` of an entry nobody proposed to drop. */
  | { readonly reason: "not-proposed"; readonly entry: MemoryEntry };

/** `memory drop`: the entry dropped by the person, or only proposed to drop by an agent. */
export function memoryDropCard(entry: MemoryEntry, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const reason = entry.drop?.reason ?? "";
  if (entry.status === "dropped") {
    return card(
      [t(`${entry.id} descartada: ${reason}`, `${entry.id} dropped: ${reason}`)],
      goOn(ctx),
      t,
    );
  }
  const { command } = ctx;
  return card(
    [
      t(
        `${entry.id} queda propuesta para descartar: ${reason} Solo la persona descarta: la verá en «TE TOCA» de \`${command} status\`.`,
        `${entry.id} is now proposed to drop: ${reason} Only the person drops: they will see it in «YOUR TURN» of \`${command} status\`.`,
      ),
    ],
    t(
      `dile al usuario que la descarte con \`${command} memory drop ${entry.id}\` desde su terminal, o que la mantenga con \`${command} memory keep ${entry.id}\`.`,
      `tell the user to drop it with \`${command} memory drop ${entry.id}\` from their terminal, or to keep it with \`${command} memory keep ${entry.id}\`.`,
    ),
    t,
  );
}

/** `memory keep`: the entry proposed to drop is open again. */
export function memoryKeptCard(entry: MemoryEntry, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return card([t(`${entry.id} sigue abierta.`, `${entry.id} stays open.`)], goOn(ctx), t);
}

/** Why `memory drop` or `memory keep` changed nothing, and what to do instead. */
export function memoryDropRefusalCard(refusal: MemoryDropRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    ...card([refusalReason(refusal, t)], refusalNext(refusal, ctx, t), t),
    status: refusal.reason === "taken" ? "blocked" : "invalid",
  };
}

function refusalReason(refusal: MemoryDropRefusal, t: Translate): string {
  switch (refusal.reason) {
    case "unknown":
      return t(
        `La memoria no tiene la entrada ${refusal.id}.`,
        `Specty's memory has no entry ${refusal.id}.`,
      );
    case "closed": {
      const { id, status } = refusal.entry;
      const done = status === "done";
      return t(
        `${id} ya está ${done ? "hecha" : "descartada"}.`,
        `${id} is already ${done ? "done" : "dropped"}.`,
      );
    }
    case "taken":
      return t(
        `${refusal.entry.id} la tomó el cambio ${refusal.change}: se libera si se cancela, y queda hecha si se cierra.`,
        `${refusal.entry.id} was taken by change ${refusal.change}: it gets free if that change is cancelled, and done if it closes.`,
      );
    case "no-reason":
      return t(
        'Falta el motivo: `--reason "<motivo>"`.',
        'The reason is missing: `--reason "<reason>"`.',
      );
    case "not-proposed":
      return t(
        `${refusal.entry.id} no está propuesta para descartar.`,
        `${refusal.entry.id} is not proposed to drop.`,
      );
  }
}

function refusalNext(refusal: MemoryDropRefusal, ctx: CardContext, t: Translate): string {
  const { command } = ctx;
  switch (refusal.reason) {
    case "taken":
      return t(
        `pregúntale al usuario si cancela ${refusal.change}.`,
        `ask the user whether to cancel ${refusal.change}.`,
      );
    case "no-reason":
      return t(
        `vuelve a ejecutar \`${command} memory drop ${refusal.id} --reason "<motivo>"\`.`,
        `run \`${command} memory drop ${refusal.id} --reason "<reason>"\` again.`,
      );
    default:
      return t(
        `mira las entradas abiertas con \`${command} memory\`.`,
        `look at the open entries with \`${command} memory\`.`,
      );
  }
}

/**
 * The entries an agent proposed to drop, for «TE TOCA» of `specty status`: who proposed each and
 * why, and how the person drops or keeps them. Nothing when there are none.
 */
export function dropProposalLines(entries: readonly MemoryEntry[], ctx: CardContext): string[] {
  const proposed = entries.filter(
    (entry) => isOpenEntry(entry) && entry.status === "drop-proposed",
  );
  if (proposed.length === 0) return [];
  const t = translator(ctx.lang);
  const { command } = ctx;
  return [
    ...proposed.map((entry) => {
      const by = entry.drop?.by ?? "agent";
      const reason = entry.drop?.reason ?? firstLine(entry.text);
      return t(
        `${entry.id} · propuesta para descartar por ${by}: ${reason}`,
        `${entry.id} · proposed to drop by ${by}: ${reason}`,
      );
    }),
    t(
      `Descártala con \`${command} memory drop <id>\`, o mantenla con \`${command} memory keep <id>\`.`,
      `Drop it with \`${command} memory drop <id>\`, or keep it with \`${command} memory keep <id>\`.`,
    ),
  ];
}

function card(lines: readonly string[], next: string, t: Translate): Output {
  return {
    status: "ok",
    header: headerOf(t("memoria", "memory")),
    blocks: section(undefined, lines),
    next,
  };
}

function goOn(ctx: CardContext): string {
  return translator(ctx.lang)(
    `sigue con \`${ctx.command} next\`.`,
    `go on with \`${ctx.command} next\`.`,
  );
}
