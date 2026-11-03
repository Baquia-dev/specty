// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry } from "../memory/entries";
import { type OutputBlock, section } from "../output";
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * The lessons and decisions of the files a task or a draft touches (ADR 0016): each with its id,
 * kind, first line, quote and paths, and a reminder to keep them in mind. Nothing without entries.
 */
export function pathEntriesBlock(entries: readonly MemoryEntry[], ctx: CardContext): OutputBlock[] {
  const t = translator(ctx.lang);
  if (entries.length === 0) return [];
  const lines = entries.map((entry) => {
    const kind = entry.kind === "decision" ? t("decisión", "decision") : t("lección", "lesson");
    const quote = entry.quote === undefined ? "" : ` «${entry.quote}»`;
    const first = entry.text.trim().split("\n")[0] ?? "";
    return `${entry.id} · ${kind} · ${first}${quote} · ${t("en", "in")} ${(entry.paths ?? []).join(", ")}`;
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
