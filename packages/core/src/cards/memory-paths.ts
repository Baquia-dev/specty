// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry } from "../memory/entries";
import { type OutputBlock, section } from "../output";
import { reminderDoneLine } from "./memory";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

/**
 * The memory of the files a task or a draft touches (ADR 0016): its lessons and decisions, each
 * with its id, kind, first line, quote and paths, and a reminder to keep them in mind; then its
 * reminders, in their own section, and how to mark one done. Nothing without entries.
 */
export function pathEntriesBlock(entries: readonly MemoryEntry[], ctx: CardContext): OutputBlock[] {
  const t = translator(ctx.lang);
  const reminders = entries.filter((entry) => entry.kind === "reminder");
  return [
    ...knownBlock(
      entries.filter((entry) => entry.kind !== "reminder"),
      ctx,
      t,
    ),
    ...section(
      t("RECORDATORIOS DE ESTOS ARCHIVOS", "REMINDERS FOR THESE FILES"),
      reminders.length === 0
        ? []
        : [
            ...reminders.map((entry) => `${entry.id} · ${firstLine(entry)}${where(entry, t)}`),
            reminderDoneLine(ctx),
          ],
    ),
  ];
}

/** The lessons and decisions of the files. */
function knownBlock(
  entries: readonly MemoryEntry[],
  ctx: CardContext,
  t: Translate,
): OutputBlock[] {
  if (entries.length === 0) return [];
  const lines = entries.map((entry) => {
    const kind = entry.kind === "decision" ? t("decisión", "decision") : t("lección", "lesson");
    const quote = entry.quote === undefined ? "" : ` «${entry.quote}»`;
    return `${entry.id} · ${kind} · ${firstLine(entry)}${quote}${where(entry, t)}`;
  });
  return section(
    t("LECCIONES Y DECISIONES DE ESTOS ARCHIVOS", "LESSONS AND DECISIONS FOR THESE FILES"),
    [
      ...lines,
      t(
        `Tenlas en cuenta; si alguna ya no vale, propón descartarla con \`${ctx.command} memory drop <id> --reason "<motivo>"\`.`,
        `Keep them in mind; if one no longer holds, propose dropping it with \`${ctx.command} memory drop <id> --reason "<reason>"\`.`,
      ),
    ],
  );
}

function firstLine(entry: MemoryEntry): string {
  return entry.text.trim().split("\n")[0] ?? "";
}

function where(entry: MemoryEntry, t: Translate): string {
  return ` · ${t("en", "in")} ${(entry.paths ?? []).join(", ")}`;
}
