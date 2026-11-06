// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { MemoryEntry } from "../memory/entries";
import type { Front } from "../memory/fronts";
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { type FrontOwner, frontSection } from "./fronts";
import { goOn } from "./memory";
import { ago, heldBy } from "./status";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// Who holds each front of Specty's memory (ADR 0016): what `specty front take` and
// `specty front free` say, and why the guard does not let a conversation take another's front.

/**
 * `specty front take`: the front, who holds it, its open entries in order, and the change of its
 * first free entry as the next step. Without an owner, the guard did not record the conversation.
 */
export function frontTakenCard(
  front: Front,
  entries: readonly MemoryEntry[],
  owner: FrontOwner | undefined,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const nobody = t(
    `Nadie lleva el frente ${front.name}: solo el guard de Specty registra la conversación de un agente que lo toma.`,
    `Nobody holds front ${front.name}: only Specty's guard records the agent conversation that takes it.`,
  );
  return {
    status: "ok",
    header: headerOf(t("frentes", "fronts")),
    blocks: [
      ...(owner === undefined ? section(undefined, [nobody]) : []),
      ...frontSection(front, entries, owner, t),
    ],
    next: firstFreeNext(front, entries, ctx.command, t),
  };
}

/** The change of the front's first free entry, or the person's word when none is free. */
function firstFreeNext(
  front: Front,
  entries: readonly MemoryEntry[],
  command: string,
  t: Translate,
): string {
  const free = front.items.find((id) =>
    entries.some((entry) => entry.id === id && entry.status === "open"),
  );
  return free === undefined
    ? t(
        `el frente ${front.name} no tiene entradas libres: pregúntale a la persona qué sigue.`,
        `front ${front.name} has no free entries: ask the person what comes next.`,
      )
    : t(
        `crea el cambio de ${free}, la primera libre del frente, con \`${command} new "<título>" --request "<petición literal del usuario>" --resolves ${free}\`.`,
        `create the change of ${free}, the front's first free entry, with \`${command} new "<title>" --request "<the user's literal request>" --resolves ${free}\`.`,
      );
}

/** `specty front free`: the front has no owner now, and who held it. */
export function frontFreedCard(
  front: Front,
  owner: FrontOwner | undefined,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const freed =
    owner === undefined
      ? t(
          `El frente ${front.name} queda libre; nadie lo llevaba.`,
          `Front ${front.name} is free; nobody held it.`,
        )
      : t(
          `El frente ${front.name} queda libre (lo llevaba ${owner.tool}, ${ago(owner.ago, t)}).`,
          `Front ${front.name} is free (${owner.tool} held it, ${ago(owner.ago, t)}).`,
        );
  return {
    status: "ok",
    header: headerOf(t("frentes", "fronts")),
    blocks: section(undefined, [freed]),
    next: goOn(ctx),
  };
}

/**
 * Why the guard does not let an agent's conversation take entry `id`, of the front `owner` holds
 * from another conversation, and what to do instead: with `specty new --resolves` (`via: "new"`),
 * creating its change, or with `specty memory resolve` (`via: "memory"`).
 */
export function frontResolvesDenial(
  owner: FrontOwner,
  id: string,
  lang: Lang,
  command: string,
  via: "new" | "memory" = "new",
): { readonly reason: string; readonly next: string } {
  const t = translator(lang);
  const held = heldBy({ holder: owner }, t) ?? "";
  const { front } = owner;
  const free = t(
    `pídele a la persona que libere el frente ${front} en su terminal con \`${command} front free ${front}\`.`,
    `ask the person to free front ${front} in their terminal with \`${command} front free ${front}\`.`,
  );
  return {
    reason: t(
      `${id} es del frente ${front}, que ya tiene dueño: ${held}, en otra conversación.`,
      `${id} belongs to front ${front}, which already has an owner: ${held}, in another conversation.`,
    ),
    next:
      via === "memory"
        ? t(
            `vuelve a ejecutar \`${command} memory resolve\` sin ${id}: la resolverá la conversación de ese frente; o ${free}`,
            `run \`${command} memory resolve\` again without ${id}: the conversation of that front will resolve it; or ${free}`,
          )
        : t(
            `toma una entrada libre de tu frente o sin frente (\`${command} front\` los lista), o ${free}`,
            `take a free entry of your front or of none (\`${command} front\` lists them), or ${free}`,
          ),
  };
}

/**
 * The warning of `specty propose`: each front another session holds, with the spec's files that
 * fall in its paths. It stops nothing; nothing when no file falls in one.
 */
export function foreignFrontsBlock(
  touched: readonly { readonly owner: FrontOwner; readonly paths: readonly string[] }[],
  ctx: CardContext,
): OutputBlock[] {
  const t = translator(ctx.lang);
  if (touched.length === 0) return [];
  return section(t("FRENTES DE OTRAS SESIONES", "OTHER SESSIONS' FRONTS"), [
    ...touched.map(
      ({ owner, paths }) =>
        `${owner.front} · ${heldBy({ holder: owner }, t) ?? ""}: ${paths.join(", ")}`,
    ),
    t(
      "Estos archivos caen en las rutas de un frente que lleva otra sesión (si no es el tuyo): no frena nada, pero coméntaselo al usuario antes de seguir.",
      "These files fall in the paths of a front another session holds (if it is not yours): it stops nothing, but tell the user before going on.",
    ),
  ]);
}

/**
 * Why the guard does not let an agent's conversation take or free the front `owner` holds from
 * another conversation, and what to do instead.
 */
export function frontHeldDenial(
  owner: FrontOwner,
  action: "take" | "free",
  lang: Lang,
  command: string,
): { readonly reason: string; readonly next: string } {
  const t = translator(lang);
  const held = heldBy({ holder: owner }, t) ?? "";
  const free = `\`${command} front free ${owner.front}\``;
  return {
    reason: t(
      `El frente ${owner.front} ya tiene dueño: ${held}, en otra conversación.`,
      `Front ${owner.front} already has an owner: ${held}, in another conversation.`,
    ),
    next:
      action === "take"
        ? t(
            `toma otro frente libre (\`${command} front\` los lista) o pídele a la persona que lo libere en su terminal con ${free}; queda libre solo si esa conversación pasa \`memory.orphanAfterMin\` minutos sin dar un paso.`,
            `take another free front (\`${command} front\` lists them) or ask the person to free it in their terminal with ${free}; it frees itself only once that conversation goes \`memory.orphanAfterMin\` minutes without a step.`,
          )
        : t(
            `solo esa conversación o la persona lo liberan: pídele a la persona que lo libere en su terminal con ${free}.`,
            `only that conversation or the person frees it: ask the person to free it in their terminal with ${free}.`,
          ),
  };
}
