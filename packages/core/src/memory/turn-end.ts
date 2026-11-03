// SPDX-License-Identifier: Apache-2.0

// The pending items an agent's last message lists at the end of its turn (ADR 0016), for the
// safety net that sends the turn back when they are not in Specty's memory.

/** The words of a pending heading, without accents or case. */
const HEADING =
  /^(?:(?:lo\s+)?que\s+queda(?:\s+pendiente)?|quedan?\s+pendientes?|pendientes?|proximos\s+pasos|siguientes\s+pasos|pending(?:\s+items)?|follow[\s-]?ups?|next\s+steps|to\s?dos?)$/;
/** A first-level bullet: `-`, `*`, `•` or a number, and its text. */
const BULLET = /^(?:[-*•]|\d+[.)])\s+(.+)$/;

/**
 * The first-level bullets under each pending heading of `message`: a line alone, with `#`, in
 * bold or ending in `:`, that says «Pendientes», «Qué queda pendiente», «Próximos pasos»,
 * «Pending», «Follow-ups», «Next steps» or «To do». A list ends at the first line that is neither
 * a bullet, an indented one or blank.
 */
export function pendingInMessage(message: string): string[] {
  const items: string[] = [];
  let listing = false;
  for (const line of message.replaceAll("\r\n", "\n").split("\n")) {
    if (isHeading(line)) {
      listing = true;
      continue;
    }
    if (!listing || line.trim().length === 0 || /^\s+\S/.test(line)) continue;
    const bullet = BULLET.exec(line);
    if (bullet?.[1] === undefined) listing = false;
    else items.push(bullet[1].trim());
  }
  return items;
}

function isHeading(line: string): boolean {
  const text = line
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/^(\*\*|__)(.*)\1$/, "$2")
    .replace(/:$/, "")
    .replace(/^(\*\*|__)(.*)\1$/, "$2")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^[¿¡]/, "")
    .replace(/[?!]$/, "")
    .trim()
    .toLowerCase();
  return HEADING.test(text);
}
