// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry, MemoryStatus } from "../memory/entries";
import { headerOf, type Output } from "../output";
import { blockedCard } from "./flow";
import { firstLine } from "./memory";
import { heldBy, type StatusEntry } from "./status";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// The entries of Specty's memory a change takes (ADR 0016): what `specty new --resolves` says
// when it takes nothing.

/** Why `specty new --resolves` creates nothing. */
export type ResolvesRefusal =
  | { readonly reason: "unknown"; readonly id: string }
  | { readonly reason: "unavailable"; readonly entry: MemoryEntry }
  | { readonly reason: "not-work"; readonly entry: MemoryEntry }
  /** An open change took it first: that change as `status` sees it, and the next free entry. */
  | {
      readonly reason: "taken";
      readonly entry: MemoryEntry;
      readonly by: StatusEntry;
      readonly free?: MemoryEntry;
    };

/**
 * The card of a `specty new --resolves` that creates nothing: `invalid` when the id is wrong for
 * `--resolves`, `blocked` when the memory's state stops it.
 */
export function resolvesRefusalCard(refusal: ResolvesRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const card = blockedCard(headerOf(), reasonOf(refusal, t), nextOf(refusal, ctx, t));
  return refusal.reason === "unknown" || refusal.reason === "not-work"
    ? { ...card, status: "invalid" }
    : card;
}

const NOT_WORK = {
  reminder: ["un recordatorio", "a reminder"],
  decision: ["una decisión", "a decision"],
  lesson: ["una lección", "a lesson"],
} as const;

/** An entry's status, as «it is already …» says it. */
const STATUS: Readonly<Record<MemoryStatus, readonly [string, string]>> = {
  open: ["abierta", "open"],
  taken: ["tomada", "taken"],
  done: ["hecha", "done"],
  dropped: ["descartada", "dropped"],
  "drop-proposed": ["propuesta para descartar", "proposed to drop"],
};

function reasonOf(refusal: ResolvesRefusal, t: Translate): string {
  switch (refusal.reason) {
    case "unknown":
      return t(
        `La memoria no tiene la entrada ${refusal.id}.`,
        `Specty's memory has no entry ${refusal.id}.`,
      );
    case "unavailable": {
      const { entry } = refusal;
      const status = t(...STATUS[entry.status]);
      return t(
        `${entry.id} ya está ${status}: no se puede tomar.`,
        `${entry.id} is already ${status}: it cannot be taken.`,
      );
    }
    case "not-work": {
      const { entry } = refusal;
      const kind =
        entry.kind === "decision" || entry.kind === "lesson"
          ? NOT_WORK[entry.kind]
          : NOT_WORK.reminder;
      return t(
        `${entry.id} es ${kind[0]}: \`--resolves\` solo toma pendientes y mejoras.`,
        `${entry.id} is ${kind[1]}: \`--resolves\` only takes pending items and improvements.`,
      );
    }
    case "taken":
      return takenReason(refusal.entry, refusal.by, t);
  }
}

/** The change that took it: its phase, its folder and who holds it, as far as they are known. */
function takenReason(entry: MemoryEntry, by: StatusEntry, t: Translate): string {
  const held = heldBy(by, t);
  const facts = [
    by.phase,
    ...(by.folder === undefined ? [] : [`${t("en", "in")} ${by.folder}`]),
    ...(held === undefined ? [] : [held]),
  ].join(", ");
  return t(
    `${entry.id} ya la tomó el cambio ${by.id} (${facts}).`,
    `${entry.id} was already taken by change ${by.id} (${facts}).`,
  );
}

function nextOf(refusal: ResolvesRefusal, ctx: CardContext, t: Translate): string {
  const command = ctx.command;
  switch (refusal.reason) {
    case "unknown":
      return t(
        `mira las entradas con \`${command} memory\` y vuelve a ejecutar \`${command} new\`.`,
        `look at the entries with \`${command} memory\` and run \`${command} new\` again.`,
      );
    case "unavailable":
    case "not-work":
      return t(
        `crea el cambio sin \`--resolves ${refusal.entry.id}\`.`,
        `create the change without \`--resolves ${refusal.entry.id}\`.`,
      );
    case "taken": {
      const { by, free } = refusal;
      if (free === undefined) {
        return t(
          `pregúntale al usuario si sigue con ${by.id}: no queda ninguna entrada libre.`,
          `ask the user whether to go on with ${by.id}: no entry is free.`,
        );
      }
      const text = firstLine(free.text);
      return t(
        `pregúntale al usuario si sigue con ${by.id}; la siguiente libre es ${free.id}, «${text}»: \`${command} new "<título>" --resolves ${free.id}\`.`,
        `ask the user whether to go on with ${by.id}; the next free one is ${free.id}, “${text}”: \`${command} new "<title>" --resolves ${free.id}\`.`,
      );
    }
  }
}
