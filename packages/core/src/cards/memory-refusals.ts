// SPDX-License-Identifier: Apache-2.0
import { MEMORY_KINDS, type MemoryEntry, type MemoryKind } from "../memory/entries";
import { headerOf, type Output, section } from "../output";
import { goOn } from "./memory";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// Why `memory add` and `memory done` change nothing in Specty's memory (ADR 0016), and what to do
// instead.

/** Why `memory add` writes nothing. */
type AddRefusal =
  | { readonly reason: "empty" }
  /** `--kind` names no kind of entry. */
  | { readonly reason: "unknown-kind"; readonly kind: string }
  | { readonly reason: "no-quote" }
  /** A lesson without `--path`. */
  | { readonly reason: "no-path" }
  | TriggerRefusal;

/** Why `memory add` writes nothing about a reminder's trigger. */
type TriggerRefusal =
  /** `--due` is not a day of the calendar as YYYY-MM-DD. */
  | { readonly reason: "bad-date"; readonly value: string }
  /** `--due` on an entry of `kind`, which is not a reminder. */
  | { readonly reason: "due-not-reminder"; readonly kind: MemoryKind }
  /** Two of `--due`, `--path` and `--on-close` together: without `flags`, `--due` and `--path`. */
  | { readonly reason: "two-triggers"; readonly flags?: readonly [TriggerFlag, TriggerFlag] }
  | OnCloseRefusal;

/** The options of `memory add` that give a reminder its trigger. */
type TriggerFlag = "--due" | "--path" | "--on-close";

/** Why `memory add` writes nothing about the change a reminder waits for. */
type OnCloseRefusal =
  /** `--on-close` on an entry of `kind`, which is not a reminder. */
  | { readonly reason: "on-close-not-reminder"; readonly kind: MemoryKind }
  /** `--on-close` with `id`, which is not an open change. */
  | { readonly reason: "not-open-change"; readonly id: string };

/** Why `memory done` changes nothing. */
type DoneRefusal =
  | { readonly reason: "unknown"; readonly id: string }
  | { readonly reason: "not-reminder"; readonly entry: MemoryEntry }
  | { readonly reason: "already-done"; readonly id: string };

export type MemoryRefusal = AddRefusal | DoneRefusal;

interface RefusalTexts {
  readonly reason: string;
  readonly next: string;
}

/** Each kind with its article, as a sentence names one entry. */
const ONE_OF_KIND: Readonly<Record<MemoryKind, readonly [string, string]>> = {
  pending: ["un pendiente", "a pending item"],
  improvement: ["una mejora", "an improvement"],
  reminder: ["un recordatorio", "a reminder"],
  decision: ["una decisión", "a decision"],
  lesson: ["una lección", "a lesson"],
};

/** Why `memory add` or `memory done` changed nothing, and what to do instead. */
export function memoryRefusalCard(refusal: MemoryRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { reason, next } =
    refusal.reason === "unknown" ||
    refusal.reason === "not-reminder" ||
    refusal.reason === "already-done"
      ? doneRefusalTexts(refusal, ctx, t)
      : addRefusalTexts(refusal, ctx.command, t);
  return {
    status: "invalid",
    header: headerOf(t("memoria", "memory")),
    blocks: section(undefined, [reason]),
    next,
  };
}

/** `--kind` names no kind of entry: the one given, and the ones there are. */
function unknownKindTexts(kind: string, t: Translate): RefusalTexts {
  return {
    reason: t(`Tipo de entrada desconocido: ${kind}.`, `Unknown entry kind: ${kind}.`),
    next: t(
      `usa \`--kind ${MEMORY_KINDS.join("|")}\`.`,
      `use \`--kind ${MEMORY_KINDS.join("|")}\`.`,
    ),
  };
}

function addRefusalTexts(refusal: AddRefusal, command: string, t: Translate): RefusalTexts {
  switch (refusal.reason) {
    case "bad-date":
    case "due-not-reminder":
    case "two-triggers":
      return triggerRefusalTexts(refusal, command, t);
    case "on-close-not-reminder":
    case "not-open-change":
      return onCloseRefusalTexts(refusal, command, t);
    case "unknown-kind":
      return unknownKindTexts(refusal.kind, t);
    case "empty":
      return {
        reason: t("El texto de la entrada está vacío.", "The entry's text is empty."),
        next: t(
          `escríbelo para alguien sin el contexto de esta conversación: \`${command} memory add "<texto>"\`.`,
          `write it for someone without this conversation's context: \`${command} memory add "<text>"\`.`,
        ),
      };
    case "no-quote":
      return {
        reason: t(
          "Una decisión lleva la cita literal de la persona, y falta `--quote`.",
          "A decision carries the person's literal quote, and `--quote` is missing.",
        ),
        next: t(
          `añade sus palabras tal cual: \`${command} memory add "<texto>" --kind decision --quote "<cita>"\`.`,
          `add their words as they are: \`${command} memory add "<text>" --kind decision --quote "<quote>"\`.`,
        ),
      };
    case "no-path":
      return {
        reason: t(
          "Una lección lleva las rutas a las que se refiere, y falta `--path`.",
          "A lesson carries the paths it is about, and `--path` is missing.",
        ),
        next: t(
          `vuelve a ejecutar \`${command} memory add "<texto>" --kind lesson --path <ruta>\`.`,
          `run \`${command} memory add "<text>" --kind lesson --path <path>\` again.`,
        ),
      };
  }
}

function triggerRefusalTexts(
  refusal: Exclude<TriggerRefusal, OnCloseRefusal>,
  command: string,
  t: Translate,
): RefusalTexts {
  switch (refusal.reason) {
    case "bad-date":
      return {
        reason: t(
          `\`--due\` espera un día como AAAA-MM-DD, y «${refusal.value}» no lo es.`,
          `\`--due\` expects a day as YYYY-MM-DD, and «${refusal.value}» is not one.`,
        ),
        next: t(
          `vuelve a ejecutar \`${command} memory add "<texto>" --kind reminder --due AAAA-MM-DD\`.`,
          `run \`${command} memory add "<text>" --kind reminder --due YYYY-MM-DD\` again.`,
        ),
      };
    case "due-not-reminder": {
      const [es, en] = ONE_OF_KIND[refusal.kind];
      return {
        reason: t(
          `Solo un recordatorio espera a un día, y esta entrada sería ${es}.`,
          `Only a reminder waits for a day, and this entry would be ${en}.`,
        ),
        next: t(
          "añade `--kind reminder` o quita `--due`.",
          "add `--kind reminder` or drop `--due`.",
        ),
      };
    }
    case "two-triggers": {
      const [one, other] = refusal.flags ?? ["--due", "--path"];
      return {
        reason: t(
          `Un recordatorio lleva un solo disparador: \`${one}\` o \`${other}\`, no los dos.`,
          `A reminder carries a single trigger: \`${one}\` or \`${other}\`, not both.`,
        ),
        next: t(
          `quédate con uno y vuelve a ejecutar \`${command} memory add\`.`,
          `keep one and run \`${command} memory add\` again.`,
        ),
      };
    }
  }
}

function onCloseRefusalTexts(refusal: OnCloseRefusal, command: string, t: Translate): RefusalTexts {
  switch (refusal.reason) {
    case "on-close-not-reminder": {
      const [es, en] = ONE_OF_KIND[refusal.kind];
      return {
        reason: t(
          `Solo un recordatorio espera al cierre de un cambio, y esta entrada sería ${es}.`,
          `Only a reminder waits for a change to close, and this entry would be ${en}.`,
        ),
        next: t(
          "añade `--kind reminder` o quita `--on-close`.",
          "add `--kind reminder` or drop `--on-close`.",
        ),
      };
    }
    case "not-open-change":
      return {
        reason: t(
          `«${refusal.id}» no es un cambio abierto, y un recordatorio solo espera al cierre de uno abierto.`,
          `«${refusal.id}» is not an open change, and a reminder only waits for an open one to close.`,
        ),
        next: t(
          `\`${command} status\` lista los cambios abiertos; vuelve a ejecutar \`${command} memory add "<texto>" --kind reminder --on-close <id>\` con uno de ellos.`,
          `\`${command} status\` lists the open changes; run \`${command} memory add "<text>" --kind reminder --on-close <id>\` again with one of them.`,
        ),
      };
  }
}

function doneRefusalTexts(refusal: DoneRefusal, ctx: CardContext, t: Translate): RefusalTexts {
  const command = ctx.command;
  switch (refusal.reason) {
    case "unknown":
      return {
        reason: t(`No hay ninguna entrada ${refusal.id}.`, `There is no entry ${refusal.id}.`),
        next: t(
          `\`${command} memory --all\` las lista todas.`,
          `\`${command} memory --all\` lists them all.`,
        ),
      };
    case "not-reminder": {
      const [es, en] = ONE_OF_KIND[refusal.entry.kind];
      return {
        reason: t(
          `Solo un recordatorio se marca hecho, y ${refusal.entry.id} es ${es}.`,
          `Only a reminder is marked done, and ${refusal.entry.id} is ${en}.`,
        ),
        next: t(
          `los pendientes y las mejoras se hacen al cerrar el cambio que los toma; sigue con \`${command} next\`.`,
          `pending items and improvements are done when the change that takes them closes; go on with \`${command} next\`.`,
        ),
      };
    }
    case "already-done":
      return {
        reason: t(`${refusal.id} ya está hecha.`, `${refusal.id} is already done.`),
        next: goOn(ctx),
      };
  }
}
