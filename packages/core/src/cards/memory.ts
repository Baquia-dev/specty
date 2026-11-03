// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import {
  byDate,
  isOpenEntry,
  MEMORY_KINDS,
  type MemoryEntry,
  type MemoryKind,
  type MemoryOperation,
  type MemoryStatus,
} from "../memory/entries";
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// Specty's memory (ADR 0016): what `specty memory`, `memory add` and `memory done` say, and the
// texts Specty writes to the memory's branch: its README and the subject of each commit.

/** `specty memory`'s card, with the entries as data too: `--json` prints them. */
export interface MemoryListOutput extends Output {
  readonly entries: readonly MemoryEntry[];
}

/** Why `memory add` writes nothing. */
type AddRefusal =
  | { readonly reason: "empty" }
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
  /** `--due` and `--path` together. */
  | { readonly reason: "two-triggers" };

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

const KINDS: Readonly<Record<MemoryKind, readonly [string, string]>> = {
  pending: ["pendiente", "pending"],
  improvement: ["mejora", "improvement"],
  reminder: ["recordatorio", "reminder"],
  decision: ["decisión", "decision"],
  lesson: ["lección", "lesson"],
};

/** Each kind with its article, as a sentence names one entry. */
const ONE_OF_KIND: Readonly<Record<MemoryKind, readonly [string, string]>> = {
  pending: ["un pendiente", "a pending item"],
  improvement: ["una mejora", "an improvement"],
  reminder: ["un recordatorio", "a reminder"],
  decision: ["una decisión", "a decision"],
  lesson: ["una lección", "a lesson"],
};

/** The README's heading of each kind. */
const SECTIONS: Readonly<Record<MemoryKind, readonly [string, string]>> = {
  pending: ["Pendientes", "Pending"],
  improvement: ["Mejoras", "Improvements"],
  reminder: ["Recordatorios", "Reminders"],
  decision: ["Decisiones", "Decisions"],
  lesson: ["Lecciones", "Lessons"],
};

const STATUSES: Readonly<Record<Exclude<MemoryStatus, "open">, readonly [string, string]>> = {
  taken: ["tomada", "taken"],
  done: ["hecha", "done"],
  "drop-proposed": ["propuesta para descartar", "proposed to drop"],
  dropped: ["descartada", "dropped"],
};

/** `specty memory`: the open entries by date, or every one with `all`. */
export function memoryListCard(
  entries: readonly MemoryEntry[],
  options: { readonly all: boolean },
  ctx: CardContext,
): MemoryListOutput {
  const t = translator(ctx.lang);
  const listed = byDate(options.all ? entries : entries.filter(isOpenEntry));
  const none = options.all
    ? t("No hay entradas.", "There are no entries.")
    : t("No hay entradas abiertas.", "There are no open entries.");
  const add = t(
    `\`${ctx.command} memory add "<texto>"\``,
    `\`${ctx.command} memory add "<text>"\``,
  );
  return {
    status: "ok",
    header: headerOf(t("memoria", "memory")),
    blocks: section(
      options.all ? t("ENTRADAS", "ENTRIES") : t("ENTRADAS ABIERTAS", "OPEN ENTRIES"),
      listed.length > 0 ? listed.map((entry) => entryLine(entry, t)) : [none],
    ),
    next:
      listed.length > 0
        ? t(`para anotar otra, ${add}.`, `to add another, ${add}.`)
        : t(`anota una con ${add}.`, `add one with ${add}.`),
    entries: listed,
  };
}

/** `specty memory add`: the new entry and the branch it went to. */
export function memoryAddedCard(entry: MemoryEntry, branch: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const line = firstLine(entry.text);
  return {
    status: "ok",
    header: headerOf(t("memoria", "memory")),
    blocks: section(undefined, [
      t(`${entry.id} anotada en ${branch}: ${line}`, `${entry.id} added to ${branch}: ${line}`),
    ]),
    next: goOn(ctx),
  };
}

/** `specty memory done`: the reminder marked done. */
export function memoryDoneCard(entry: MemoryEntry, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const line = firstLine(entry.text);
  return {
    status: "ok",
    header: headerOf(t("memoria", "memory")),
    blocks: section(undefined, [t(`${entry.id} hecha: ${line}`, `${entry.id} done: ${line}`)]),
    next: goOn(ctx),
  };
}

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

function addRefusalTexts(refusal: AddRefusal, command: string, t: Translate): RefusalTexts {
  switch (refusal.reason) {
    case "bad-date":
    case "due-not-reminder":
    case "two-triggers":
      return triggerRefusalTexts(refusal, command, t);
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

function triggerRefusalTexts(refusal: TriggerRefusal, command: string, t: Translate): RefusalTexts {
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
    case "two-triggers":
      return {
        reason: t(
          "Un recordatorio lleva un solo disparador: `--due` o `--path`, no los dos.",
          "A reminder carries a single trigger: `--due` or `--path`, not both.",
        ),
        next: t(
          `quédate con uno y vuelve a ejecutar \`${command} memory add\`.`,
          `keep one and run \`${command} memory add\` again.`,
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

/** How many free entries the card with no active change shows. */
const FREE_SHOWN = 3;

/**
 * The memory in the card with no active change, which is also the one a session gets when it
 * starts: the open pending items and improvements, with the first free ones, and the reminders.
 * Nothing when none is open, so the card stays as it was.
 */
export function memoryStartBlocks(
  entries: readonly MemoryEntry[],
  ctx: CardContext,
): OutputBlock[] {
  const t = translator(ctx.lang);
  const open = byDate(entries.filter(isOpenEntry));
  return [
    ...section(t("MEMORIA DE SPECTY", "SPECTY'S MEMORY"), workLines(open, ctx, t)),
    ...section(t("RECORDATORIOS", "REMINDERS"), reminderLines(entries, ctx)),
  ];
}

/**
 * The open reminders by date, each with its id and first line, and how to mark one done; nothing
 * when none is open. The start card and «TE TOCA» of `specty status` show them.
 */
export function reminderLines(entries: readonly MemoryEntry[], ctx: CardContext): string[] {
  const reminders = byDate(entries.filter(isOpenEntry)).filter(
    (entry) => entry.kind === "reminder",
  );
  if (reminders.length === 0) return [];
  return [
    ...reminders.map((entry) => `${entry.id} · ${firstLine(entry.text)}`),
    reminderDoneLine(ctx),
  ];
}

/** How to mark a reminder done, under a list of them. */
export function reminderDoneLine(ctx: CardContext): string {
  return translator(ctx.lang)(
    `Cuando se cumpla uno, márcalo hecho con \`${ctx.command} memory done <id>\`.`,
    `When one is fulfilled, mark it done with \`${ctx.command} memory done <id>\`.`,
  );
}

/** The open pending items and improvements: how many, the first free ones, and how to take one. */
function workLines(open: readonly MemoryEntry[], ctx: CardContext, t: Translate): string[] {
  const work = open.filter((entry) => entry.kind === "pending" || entry.kind === "improvement");
  if (work.length === 0) return [];
  const free = work.filter((entry) => entry.status === "open").slice(0, FREE_SHOWN);
  const command = ctx.command;
  return [
    free.length > 0
      ? t(
          `Pendientes y mejoras abiertas: ${work.length}. Las primeras libres:`,
          `Open pending items and improvements: ${work.length}. The first free ones:`,
        )
      : t(
          `Pendientes y mejoras abiertas: ${work.length}; ninguna está libre.`,
          `Open pending items and improvements: ${work.length}; none is free.`,
        ),
    ...free.map((entry) => `${entry.id} · ${t(...KINDS[entry.kind])} · ${firstLine(entry.text)}`),
    t(
      `No las empieces si el usuario no lo pide. Para tomar una, crea su cambio con \`${command} new\` y cita su id en la petición; todas, con \`${command} memory\`.`,
      `Do not start them unless the user asks. To take one, create its change with \`${command} new\` and cite its id in the request; all of them, with \`${command} memory\`.`,
    ),
  ];
}

/** The README of the memory's branch: its open entries by kind, in the project's language. */
export function memoryReadme(entries: readonly MemoryEntry[], lang: Lang): string {
  const t = translator(lang);
  const open = byDate(entries.filter(isOpenEntry));
  const kinds = MEMORY_KINDS.flatMap((kind) => {
    const lines = open
      .filter((entry) => entry.kind === kind)
      .map((entry) => `- [${entry.id}](entries/${entry.id}.md) — ${summary(entry, t)}`);
    return lines.length === 0 ? [] : [`## ${t(...SECTIONS[kind])}`, "", ...lines, ""];
  });
  return [
    `# ${t("Memoria de Specty", "Specty's memory")}`,
    "",
    t(
      "Specty escribe esta rama y rehace este índice en cada cambio. Cada entrada vive en `entries/<id>.md`.",
      "Specty writes this branch and rebuilds this index on every change. Each entry lives in `entries/<id>.md`.",
    ),
    "",
    ...(kinds.length > 0
      ? kinds
      : [t("No hay entradas abiertas.", "There are no open entries."), ""]),
  ].join("\n");
}

/**
 * The subject of the commit that adds entry `id` to the memory's branch, marks it done or takes
 * it for a change.
 */
export function memoryCommitSubject(operation: MemoryOperation, id: string, lang: Lang): string {
  const t = translator(lang);
  switch (operation) {
    case "add":
      return t(`memoria: anota ${id}`, `memory: add ${id}`);
    case "done":
      return t(`memoria: ${id} hecha`, `memory: ${id} done`);
    case "take":
      return t(`memoria: ${id} tomada`, `memory: ${id} taken`);
    case "free":
      return t(`memoria: ${id} libre de nuevo`, `memory: ${id} free again`);
    case "drop":
      return t(`memoria: ${id} descartada`, `memory: ${id} dropped`);
    case "propose-drop":
      return t(`memoria: ${id} propuesta para descartar`, `memory: ${id} proposed to drop`);
    case "keep":
      return t(`memoria: ${id} se mantiene`, `memory: ${id} kept`);
  }
}

/**
 * The entries a change resolves (`specty new --resolves`), for its draft: each with its kind and
 * first line, and what happens to them when it is archived. Nothing without entries.
 */
export function resolvesLines(entries: readonly MemoryEntry[], ctx: CardContext): string[] {
  if (entries.length === 0) return [];
  const t = translator(ctx.lang);
  return [
    ...entries.map(
      (entry) => `${entry.id} · ${t(...KINDS[entry.kind])} · ${firstLine(entry.text)}`,
    ),
    t(
      "Quedan hechas al cerrarse este cambio, y libres si se cancela.",
      "They get done when this change closes, and free again if it is cancelled.",
    ),
  ];
}

/** One entry in a list: its id, kind, status unless open, text, quote and origin. */
function entryLine(entry: MemoryEntry, t: Translate): string {
  const kind = t(...KINDS[entry.kind]);
  const paths = entry.paths === undefined ? "" : ` · ${t("en", "in")} ${entry.paths.join(", ")}`;
  const due = entry.due === undefined ? "" : ` · ${t("desde", "from")} ${entry.due}`;
  return `${entry.id} · ${kind}${statusOf(entry, t)}${due} · ${firstLine(entry.text)}${quoted(entry)} — ${originOf(entry, t)}${paths}`;
}

/** Its status unless open, with the change that took it when it is taken. */
function statusOf(entry: MemoryEntry, t: Translate): string {
  if (entry.status === "open") return "";
  const change = entry.status === "taken" ? entry.taken?.change : undefined;
  return change === undefined
    ? ` · ${t(...STATUSES[entry.status])}`
    : ` · ${t(`tomada por ${change}`, `taken by ${change}`)}`;
}

/** An entry in the README: its text, quote and origin. */
function summary(entry: MemoryEntry, t: Translate): string {
  return `${firstLine(entry.text)}${quoted(entry)} · ${originOf(entry, t)}`;
}

function quoted(entry: MemoryEntry): string {
  return entry.quote === undefined ? "" : ` «${entry.quote}»`;
}

/** The change it came from, who added it and the day. */
function originOf(entry: MemoryEntry, t: Translate): string {
  const by = entry.origin.by === "person" ? t("la persona", "the person") : entry.origin.by;
  return [entry.origin.change, by, entry.created.slice(0, 10)]
    .filter((part) => part !== undefined)
    .join(", ");
}

export function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}

function goOn(ctx: CardContext): string {
  return translator(ctx.lang)(
    `sigue con \`${ctx.command} next\`.`,
    `go on with \`${ctx.command} next\`.`,
  );
}
