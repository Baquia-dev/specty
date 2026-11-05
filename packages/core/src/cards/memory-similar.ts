// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry } from "../memory/entries";
import { headerOf, type Output, section } from "../output";
import { workLine } from "./memory";
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * The card of an agent's `memory add` that writes nothing because its pending item or improvement
 * may repeat open ones (ADR 0016): each one, by date, and what to do if it is the same one, which
 * the user does not hear about, or a different one.
 */
export function memorySimilarCard(found: readonly MemoryEntry[], ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const ids = found.map((entry) => entry.id).join(" ");
  return {
    status: "blocked",
    header: headerOf(t("memoria", "memory")),
    blocks: section(undefined, [
      t(
        "No se anotó porque puede repetir una entrada abierta:",
        "Not added, as it may repeat an open entry:",
      ),
      ...found.map((entry) => `  ${workLine(entry, t)}`),
    ]),
    next: t(
      `si es la misma, no la añadas ni se la menciones al usuario, y sigue con \`${ctx.command} next\`; si es distinta, vuelve a ejecutar \`${ctx.command} memory add\` con \`--distinct-from ${ids}\`.`,
      `if it is the same one, do not add it or mention it to the user, and go on with \`${ctx.command} next\`; if it is different, run \`${ctx.command} memory add\` again with \`--distinct-from ${ids}\`.`,
    ),
  };
}
