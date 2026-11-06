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
import type { FrontsView } from "./fronts";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// Specty's memory (ADR 0016): what `specty memory`, `memory add` and `memory done` say, and the
// texts Specty writes to the memory's branch: its README and the subject of each commit.

/** `specty memory`'s card, with the entries as data too: `--json` prints them. */
export interface MemoryListOutput extends Output {
  readonly entries: readonly MemoryEntry[];
}

const KINDS: Readonly<Record<MemoryKind, readonly [string, string]>> = {
  pending: ["pendiente", "pending"],
  improvement: ["mejora", "improvement"],
  reminder: ["recordatorio", "reminder"],
  decision: ["decisión", "decision"],
  lesson: ["lección", "lesson"],
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

/** How many free entries of the conversation's own front the card with no active change shows. */
const FREE_SHOWN = 3;

/**
 * The memory in the card with no active change, which is also the one a session gets when it
 * starts: the reminders, and the first free entries of the front the conversation holds (ADR
 * 0016). The other open pending items and improvements are not the session's work, so the card
 * neither lists nor counts them. Nothing when none of those is open, so the card stays as it was.
 */
export function memoryStartBlocks(
  entries: readonly MemoryEntry[],
  ctx: CardContext,
  fronts?: FrontsView,
): OutputBlock[] {
  const t = translator(ctx.lang);
  const open = byDate(entries.filter(isOpenEntry));
  return [
    ...section(t("MEMORIA DE SPECTY", "SPECTY'S MEMORY"), frontLines(open, ctx, t, fronts)),
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

/**
 * The first free entries of the conversation's own front, in the front's order, and how to take
 * one, or that it has none free; nothing without a front of its own or an open pending item or
 * improvement.
 */
function frontLines(
  open: readonly MemoryEntry[],
  ctx: CardContext,
  t: Translate,
  fronts?: FrontsView,
): string[] {
  const work = open.filter((entry) => entry.kind === "pending" || entry.kind === "improvement");
  const own = fronts?.fronts.find((front) => front.name === fronts.own);
  if (own === undefined || work.length === 0) return [];
  const free = own.items
    .flatMap((id) => work.filter((entry) => entry.id === id && entry.status === "open"))
    .slice(0, FREE_SHOWN);
  const { name } = own;
  if (free.length === 0)
    return [
      t(
        `Tu frente, ${name}, no tiene ninguna entrada libre: pregúntale a la persona qué sigue.`,
        `Your front, ${name}, has no free entry: ask the person what comes next.`,
      ),
    ];
  return [
    t(
      `Las primeras entradas libres de tu frente, ${name}, en su orden:`,
      `The first free entries of your front, ${name}, in its order:`,
    ),
    ...free.map((entry) => workLine(entry, t)),
    t(
      `No las empieces si el usuario no lo pide. Para tomar una, crea su cambio con \`${ctx.command} new\` y cita su id en la petición.`,
      `Do not start them unless the user asks. To take one, create its change with \`${ctx.command} new\` and cite its id in the request.`,
    ),
  ];
}

/** A pending item or improvement: its id, kind and first line. */
export function workLine(entry: MemoryEntry, t: Translate): string {
  return `${entry.id} · ${t(...KINDS[entry.kind])} · ${firstLine(entry.text)}`;
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
    case "fire":
      return t(`memoria: ${id} disparada`, `memory: ${id} fired`);
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
  const onClose =
    entry.onClose === undefined
      ? ""
      : ` · ${t(`al cerrar ${entry.onClose}`, `when ${entry.onClose} closes`)}`;
  return `${entry.id} · ${kind}${statusOf(entry, t)}${due}${onClose} · ${firstLine(entry.text)}${quoted(entry)} — ${originOf(entry, t)}${paths}`;
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

/** The next step after a change to the memory: go on with `next`. */
export function goOn(ctx: CardContext): string {
  return translator(ctx.lang)(
    `sigue con \`${ctx.command} next\`.`,
    `go on with \`${ctx.command} next\`.`,
  );
}
