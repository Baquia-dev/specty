// SPDX-License-Identifier: Apache-2.0
import type { DuplicateReason } from "../flow/duplicates";
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { heldBy, type StatusEntry } from "./status";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

/** An open change a new one may duplicate: as `status` sees it, and why. */
export interface DuplicateView {
  readonly change: StatusEntry;
  readonly reason: DuplicateReason;
}

/**
 * The card of a `specty new` that creates nothing because it may duplicate open changes (ADR
 * 0016): each one, where it is and who holds it, why, and that the user decides.
 */
export function duplicateCard(found: readonly DuplicateView[], ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const ids = found.map(({ change }) => change.id).join(" ");
  return {
    status: "blocked",
    header: headerOf(),
    blocks: section(undefined, [
      t("Puede duplicar un cambio abierto:", "It may duplicate an open change:"),
      ...found.map((view) => `  ${duplicateLine(view, t)}`),
    ]),
    next: t(
      `pregúntale al usuario si es otro trabajo; si lo es, vuelve a ejecutar \`${ctx.command} new\` con \`--distinct-from ${ids}\`.`,
      `ask the user whether it is other work; if it is, run \`${ctx.command} new\` again with \`--distinct-from ${ids}\`.`,
    ),
  };
}

/** The change, its phase, folder and holder as far as known, its title and why it looks alike. */
function duplicateLine({ change, reason }: DuplicateView, t: Translate): string {
  const why =
    reason.kind === "follows"
      ? t(`sigue también a ${reason.change}`, `it also follows ${reason.change}`)
      : reason.kind === "title"
        ? t("título parecido", "similar title")
        : t("petición parecida", "similar request");
  return `${change.id} (${factsOf(change, t)}) — ${titleOf(change, t)}: ${why}`;
}

/** An open change a proposed spec shares at least half of its governed files with. */
export interface DuplicateFilesView {
  readonly change: StatusEntry;
  /** How many of the spec's governed files it also lists. */
  readonly shared: number;
  /** How many governed files the spec lists. */
  readonly total: number;
}

/**
 * The «POSIBLE DUPLICADO» section of `propose` (ADR 0016): each open change the spec shares at
 * least half of its governed files with. Nothing without one.
 */
export function duplicateFilesBlock(
  found: readonly DuplicateFilesView[],
  ctx: CardContext,
): OutputBlock[] {
  const t = translator(ctx.lang);
  return section(
    t("POSIBLE DUPLICADO", "POSSIBLE DUPLICATE"),
    found.map(({ change, shared, total }) => {
      const where = `${change.id} (${factsOf(change, t)}) — ${titleOf(change, t)}.`;
      return t(
        `Comparte ${shared} de ${total} archivos gobernados con ${where}`,
        `Shares ${shared} of ${total} governed files with ${where}`,
      );
    }),
  );
}

/** `propose`'s next step in delegated mode with a possible duplicate: the user decides first. */
export function duplicateApproveNext(ids: readonly string[], ctx: CardContext): string {
  const t = translator(ctx.lang);
  const list = ids.join(", ");
  return t(
    `modo delegado: antes de aprobar, pregúntale al usuario si este cambio duplica ${list}; si es otro trabajo, aprueba con \`${ctx.command} approve\`, y si no, cancélalo con \`${ctx.command} cancel\`.`,
    `delegated mode: before approving, ask the user whether this change duplicates ${list}; if it is other work, approve with \`${ctx.command} approve\`, and if not, cancel it with \`${ctx.command} cancel\`.`,
  );
}

/** Its phase, folder and holder, as far as they are known. */
function factsOf(change: StatusEntry, t: Translate): string {
  const held = heldBy(change, t);
  return [
    change.phase,
    ...(change.folder === undefined ? [] : [`${t("en", "in")} ${change.folder}`]),
    ...(held === undefined ? [] : [held]),
  ].join(", ");
}

function titleOf(change: StatusEntry, t: Translate): string {
  return t(`«${change.title}»`, `“${change.title}”`);
}
