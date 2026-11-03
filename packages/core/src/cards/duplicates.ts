// SPDX-License-Identifier: Apache-2.0
import type { DuplicateReason } from "../flow/duplicates";
import { headerOf, type Output, section } from "../output";
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
  const held = heldBy(change, t);
  const facts = [
    change.phase,
    ...(change.folder === undefined ? [] : [`${t("en", "in")} ${change.folder}`]),
    ...(held === undefined ? [] : [held]),
  ].join(", ");
  const why =
    reason.kind === "follows"
      ? t(`sigue también a ${reason.change}`, `it also follows ${reason.change}`)
      : reason.kind === "title"
        ? t("título parecido", "similar title")
        : t("petición parecida", "similar request");
  return `${change.id} (${facts}) — ${t(`«${change.title}»`, `“${change.title}”`)}: ${why}`;
}
