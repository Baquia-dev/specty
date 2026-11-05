// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry } from "../memory/entries";
import { type OutputBlock, section } from "../output";
import { firstLine } from "./memory";
import { translator } from "./text";
import type { CardContext } from "./view";

// What the output of the command that archives a change says of Specty's memory (ADR 0016): the
// entries the change took and its closing marked done, the reminders it fired and the pending
// items its closing left.

/**
 * The entries a closed change took (`new --resolves` or `memory resolve`), which its closing
 * marked done, in the output of the command that closed it: each with its id and first line, and
 * that they leave the open entries. Nothing without them.
 */
export function resolvedBlocks(entries: readonly MemoryEntry[], ctx: CardContext): OutputBlock[] {
  const t = translator(ctx.lang);
  if (entries.length === 0) return [];
  return section(t("PENDIENTES QUE RESOLVIÓ ESTE CAMBIO", "PENDING ITEMS THIS CHANGE RESOLVED"), [
    ...entries.map((entry) => `${entry.id} · ${firstLine(entry.text)}`),
    t(
      "Quedan hechos y salen de la lista de abiertos.",
      "They are done and leave the list of open entries.",
    ),
  ]);
}

/**
 * The reminders an archived change fired, in the output of the command that archived it: each
 * with its id and first line, and that from now on they show in every session. Nothing without
 * them.
 */
export function firedRemindersBlocks(
  entries: readonly MemoryEntry[],
  ctx: CardContext,
): OutputBlock[] {
  const t = translator(ctx.lang);
  if (entries.length === 0) return [];
  return section(
    t("RECORDATORIOS QUE ESPERABAN A ESTE CAMBIO", "REMINDERS THAT WAITED FOR THIS CHANGE"),
    [
      ...entries.map((entry) => `${entry.id} · ${firstLine(entry.text)}`),
      t(
        `Desde ahora salen en cada sesión hasta que se marquen hechos con \`${ctx.command} memory done <id>\`.`,
        `From now on they show in every session until marked done with \`${ctx.command} memory done <id>\`.`,
      ),
    ],
  );
}

/**
 * The pending items a closed change left in the memory (its «### Pendientes» and the remarks of
 * its review its closing does not cite), in the order they were added: each with its id and first
 * line, and that the person sees them; agents only see their own work's (ADR 0016). Nothing
 * without them.
 */
export function harvestedBlocks(entries: readonly MemoryEntry[], ctx: CardContext): OutputBlock[] {
  const t = translator(ctx.lang);
  if (entries.length === 0) return [];
  return section(t("PENDIENTES QUE QUEDAN EN LA MEMORIA", "PENDING ITEMS LEFT IN THE MEMORY"), [
    ...entries.map((entry) => `${entry.id} · ${firstLine(entry.text)}`),
    t(
      `La persona los ve en la página Memoria de \`${ctx.command} ui\` y con \`${ctx.command} memory\`.`,
      `The person sees them on the Memory page of \`${ctx.command} ui\` and with \`${ctx.command} memory\`.`,
    ),
  ]);
}
