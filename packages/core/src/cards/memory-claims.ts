// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry, MemoryStatus } from "../memory/entries";
import { headerOf, type Output, section } from "../output";
import { blockedCard } from "./flow";
import { firstLine, goOn, resolvesLines } from "./memory";
import { heldBy, type StatusEntry } from "./status";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// The entries of Specty's memory a change takes (ADR 0016): what `specty new --resolves` says
// when it takes nothing, and what `specty memory resolve` says, from inside the change.

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
  const card = blockedCard(
    headerOf(),
    reasonOf(refusal, t, "`--resolves`"),
    nextOf(refusal, ctx, t),
  );
  return refusal.reason === "unknown" || refusal.reason === "not-work"
    ? { ...card, status: "invalid" }
    : card;
}

/** Why `specty memory resolve` takes nothing: as `--resolves`, or no open change in the folder. */
export type MemoryResolveRefusal = ResolvesRefusal | { readonly reason: "no-change" };

/**
 * `specty memory resolve`: the entries this folder's open change took, each with its kind and
 * first line, and what happens to them when the change is archived.
 */
export function memoryResolvedCard(entries: readonly MemoryEntry[], ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf(t("memoria", "memory")),
    blocks: section(t("RESUELVE", "RESOLVES"), resolvesLines(entries, ctx)),
    next: goOn(ctx),
  };
}

/**
 * The card of a `specty memory resolve` that takes nothing: `invalid` when an id is wrong for it,
 * `blocked` when the folder or the memory's state stops it.
 */
export function memoryResolveRefusalCard(refusal: MemoryResolveRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const resolve = `\`${ctx.command} memory resolve\``;
  if (refusal.reason === "no-change") {
    return blockedCard(
      headerOf(),
      t(
        `No hay un cambio abierto en esta carpeta: ${resolve} toma las entradas para ese cambio.`,
        `There is no open change in this folder: ${resolve} takes the entries for that change.`,
      ),
      t(
        "entra en la carpeta del cambio cuyo trabajo las resolvió y vuelve a ejecutarlo; si ninguno lo hizo, déjalas abiertas.",
        "go into the folder of the change whose work resolved them and run it again; if none did, leave them open.",
      ),
    );
  }
  const card = blockedCard(headerOf(), reasonOf(refusal, t, resolve), resolveNext(refusal, ctx, t));
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

/** Why an entry cannot be taken; `taking`, the command that takes it, as the text names it. */
function reasonOf(refusal: ResolvesRefusal, t: Translate, taking: string): string {
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
        `${entry.id} es ${kind[0]}: ${taking} solo toma pendientes y mejoras.`,
        `${entry.id} is ${kind[1]}: ${taking} only takes pending items and improvements.`,
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

/** What to do after a `specty memory resolve` that took nothing: run it again without the entry. */
function resolveNext(refusal: ResolvesRefusal, ctx: CardContext, t: Translate): string {
  const { command } = ctx;
  if (refusal.reason === "unknown") {
    return t(
      `comprueba el id con \`${command} memory\` y vuelve a ejecutar \`${command} memory resolve\`.`,
      `check the id with \`${command} memory\` and run \`${command} memory resolve\` again.`,
    );
  }
  const { id, kind } = refusal.entry;
  if (refusal.reason === "not-work" && kind === "reminder") {
    return t(
      `si tu trabajo lo cumplió, márcalo hecho con \`${command} memory done ${id}\`; vuelve a ejecutarlo sin él.`,
      `if your work fulfilled it, mark it done with \`${command} memory done ${id}\`; run it again without it.`,
    );
  }
  const again = t(
    `vuelve a ejecutarlo sin ${id}, o sigue con \`${command} next\`.`,
    `run it again without ${id}, or go on with \`${command} next\`.`,
  );
  return refusal.reason === "taken"
    ? t(
        `la resolverá ese cambio al cerrarse: ${again}`,
        `that change will resolve it when it closes: ${again}`,
      )
    : again;
}
