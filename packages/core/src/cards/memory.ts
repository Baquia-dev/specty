// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import {
  isOpenEntry,
  MEMORY_KINDS,
  type MemoryEntry,
  type MemoryKind,
  type MemoryStatus,
} from "../memory/entries";
import { headerOf, type Output, section } from "../output";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// Specty's memory (ADR 0016): what `specty memory`, `memory add` and `memory done` say, and the
// texts Specty writes to the memory's branch: its README and the subject of each commit.

/** `specty memory`'s card, with the entries as data too: `--json` prints them. */
export interface MemoryListOutput extends Output {
  readonly entries: readonly MemoryEntry[];
}

/** Why `memory add` writes nothing. */
type AddRefusal = { readonly reason: "empty" } | { readonly reason: "no-quote" };

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
};

/** Each kind with its article, as a sentence names one entry. */
const ONE_OF_KIND: Readonly<Record<MemoryKind, readonly [string, string]>> = {
  pending: ["un pendiente", "a pending item"],
  improvement: ["una mejora", "an improvement"],
  reminder: ["un recordatorio", "a reminder"],
  decision: ["una decisión", "a decision"],
};

/** The README's heading of each kind. */
const SECTIONS: Readonly<Record<MemoryKind, readonly [string, string]>> = {
  pending: ["Pendientes", "Pending"],
  improvement: ["Mejoras", "Improvements"],
  reminder: ["Recordatorios", "Reminders"],
  decision: ["Decisiones", "Decisions"],
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
    refusal.reason === "empty" || refusal.reason === "no-quote"
      ? addRefusalTexts(refusal, ctx.command, t)
      : doneRefusalTexts(refusal, ctx, t);
  return {
    status: "invalid",
    header: headerOf(t("memoria", "memory")),
    blocks: section(undefined, [reason]),
    next,
  };
}

function addRefusalTexts(refusal: AddRefusal, command: string, t: Translate): RefusalTexts {
  switch (refusal.reason) {
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

/** The subject of the commit that adds entry `id` to the memory's branch, or marks it done. */
export function memoryCommitSubject(operation: "add" | "done", id: string, lang: Lang): string {
  const t = translator(lang);
  return operation === "add"
    ? t(`memoria: anota ${id}`, `memory: add ${id}`)
    : t(`memoria: ${id} hecha`, `memory: ${id} done`);
}

/** One entry in a list: its id, kind, status unless open, text, quote and origin. */
function entryLine(entry: MemoryEntry, t: Translate): string {
  const kind = t(...KINDS[entry.kind]);
  const status = entry.status === "open" ? "" : ` · ${t(...STATUSES[entry.status])}`;
  return `${entry.id} · ${kind}${status} · ${firstLine(entry.text)}${quoted(entry)} — ${originOf(entry, t)}`;
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

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}

/** By date and, on the same date, the P ids before the D ones, each by number. */
function byDate(entries: readonly MemoryEntry[]): readonly MemoryEntry[] {
  const number = (entry: MemoryEntry) => Number(entry.id.slice(1));
  return entries.toSorted(
    (a, b) =>
      a.created.localeCompare(b.created) ||
      b.id.charAt(0).localeCompare(a.id.charAt(0)) ||
      number(a) - number(b),
  );
}

function goOn(ctx: CardContext): string {
  return translator(ctx.lang)(
    `sigue con \`${ctx.command} next\`.`,
    `go on with \`${ctx.command} next\`.`,
  );
}
