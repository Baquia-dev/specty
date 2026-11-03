// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { translator } from "./text";
import type { CardContext, NoteView } from "./view";

// The change's log (ADR 0016): what `specty note` says, and the last notes in `next`'s card, which
// a session gets when it starts in the change's folder, after `/clear` or after a compaction.

/** Why `specty note` adds nothing. */
export type NoteRefusal = { readonly reason: "empty" } | { readonly reason: "no-change" };

/** `specty note`: the note is in the change's audit. */
export function notedCard(id: string, text: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf(id),
    blocks: section(undefined, [
      t(`Nota anotada en la bitácora de ${id}.`, `Note added to the log of ${id}.`),
      `«${firstLine(text)}»`,
    ]),
    next: t(`sigue con \`${ctx.command} next\`.`, `go on with \`${ctx.command} next\`.`),
  };
}

/** Why `specty note` added nothing, and what to do instead. */
export function noteRefusalCard(refusal: NoteRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { command } = ctx;
  const [reason, next] =
    refusal.reason === "empty"
      ? [
          t("La nota está vacía.", "The note is empty."),
          t(
            `vuelve a ejecutar \`${command} note "<texto>"\` con el texto.`,
            `run \`${command} note "<text>"\` again with the text.`,
          ),
        ]
      : [
          t(
            "No hay un cambio abierto en esta carpeta: la bitácora es de un cambio.",
            "There is no open change in this folder: the log belongs to a change.",
          ),
          t(
            `entra en la carpeta del cambio, o anota lo pendiente con \`${command} memory add\`.`,
            `go into the change's folder, or add what is pending with \`${command} memory add\`.`,
          ),
        ];
  return {
    status: refusal.reason === "empty" ? "invalid" : "blocked",
    header: headerOf(),
    blocks: section(undefined, [reason]),
    next,
  };
}

/** The «BITÁCORA» section: each note with its date and time (UTC, to the minute) and first line. */
export function notesBlock(notes: readonly NoteView[], ctx: CardContext): OutputBlock[] {
  const t = translator(ctx.lang);
  return section(
    t("BITÁCORA", "LOG"),
    notes.map((note) => `${note.at.slice(0, 16).replace("T", " ")} · ${firstLine(note.text)}`),
  );
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}
