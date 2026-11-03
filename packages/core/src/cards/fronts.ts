// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { isOpenEntry, type MemoryEntry, type MemoryKind } from "../memory/entries";
import type { AssignProblem, Front, FrontMove } from "../memory/fronts";
import { headerOf, type Output, section } from "../output";
import { firstLine, goOn } from "./memory";
import { heldBy } from "./status";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// The fronts of work of Specty's memory (ADR 0016): what `specty front`, `front add` and
// `front assign` say, and the subject of the commits that write a front.

/** Why `front add` or `front assign` writes nothing. */
export type FrontRefusal =
  | { readonly reason: "bad-name"; readonly name: string }
  | { readonly reason: "exists"; readonly front: Front }
  | { readonly reason: "empty" }
  | { readonly reason: "unknown-front"; readonly name: string }
  | AssignProblem;

/** Each kind with its article, as a sentence names one entry. */
const ONE_OF_KIND: Readonly<Record<MemoryKind, readonly [string, string]>> = {
  pending: ["un pendiente", "a pending item"],
  improvement: ["una mejora", "an improvement"],
  reminder: ["un recordatorio", "a reminder"],
  decision: ["una decisión", "a decision"],
  lesson: ["una lección", "a lesson"],
};

const WORK: Readonly<Partial<Record<MemoryKind, readonly [string, string]>>> = {
  pending: ["pendiente", "pending"],
  improvement: ["mejora", "improvement"],
};

/**
 * Who holds a front: the tool of the agent whose conversation took it, and how many minutes ago
 * that conversation stepped last.
 */
export interface FrontOwner {
  readonly front: string;
  readonly tool: string;
  readonly ago: number;
}

/**
 * `specty front`: each front with what it covers, its paths, who holds it and its open entries
 * in order.
 */
export function frontListCard(
  fronts: readonly Front[],
  entries: readonly MemoryEntry[],
  ctx: CardContext,
  owners: readonly FrontOwner[] = [],
): Output {
  const t = translator(ctx.lang);
  const blocks =
    fronts.length === 0
      ? section(undefined, [t("No hay frentes.", "There are no fronts.")])
      : fronts.flatMap((front) =>
          frontSection(
            front,
            entries,
            owners.find((owner) => owner.front === front.name),
            t,
          ),
        );
  return {
    status: "ok",
    header: headerOf(t("frentes", "fronts")),
    blocks,
    next:
      fronts.length === 0
        ? t(
            `crea uno con \`${ctx.command} front add <nombre> "<texto>" --path <ruta>\`.`,
            `create one with \`${ctx.command} front add <name> "<text>" --path <path>\`.`,
          )
        : t(
            `para repartir entradas, \`${ctx.command} front assign <frente> <id>…\`.`,
            `to assign entries, \`${ctx.command} front assign <front> <id>…\`.`,
          ),
  };
}

/** A front's section: what it covers, with its paths and who holds it, and its open entries in order. */
export function frontSection(
  front: Front,
  entries: readonly MemoryEntry[],
  owner: FrontOwner | undefined,
  t: Translate,
): Output["blocks"] {
  const paths = front.paths === undefined ? "" : ` · ${t("en", "in")} ${front.paths.join(", ")}`;
  const held = owner === undefined ? "" : ` · ${heldBy({ holder: owner }, t)}`;
  const open = front.items.flatMap((id) => {
    const entry = entries.find((known) => known.id === id);
    return entry !== undefined && isOpenEntry(entry) ? [entryLine(entry, t)] : [];
  });
  return section(`${t("FRENTE", "FRONT")} ${front.name.toUpperCase()}`, [
    `${firstLine(front.text)}${paths}${held}`,
    ...(open.length > 0 ? open : [t("Sin entradas abiertas.", "No open entries.")]),
  ]);
}

/** An entry of a front: its id, kind and first line, and the change that took it. */
function entryLine(entry: MemoryEntry, t: Translate): string {
  const kind = WORK[entry.kind];
  const change = entry.status === "taken" ? entry.taken?.change : undefined;
  const taken = change === undefined ? "" : ` · ${t(`tomada por ${change}`, `taken by ${change}`)}`;
  return `${entry.id} · ${kind === undefined ? entry.kind : t(...kind)} · ${firstLine(entry.text)}${taken}`;
}

/** `specty front add`: the new front and the branch it went to. */
export function frontAddedCard(front: Front, branch: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const line = firstLine(front.text);
  return {
    status: "ok",
    header: headerOf(t("frentes", "fronts")),
    blocks: section(undefined, [
      t(
        `Frente ${front.name} creado en ${branch}: ${line}`,
        `Front ${front.name} added to ${branch}: ${line}`,
      ),
    ]),
    next: t(
      `reparte en él las entradas con \`${ctx.command} front assign ${front.name} <id>…\`.`,
      `assign entries to it with \`${ctx.command} front assign ${front.name} <id>…\`.`,
    ),
  };
}

/** `specty front assign`: the entries assigned, the front's new order and the fronts they left. */
export function frontAssignedCard(
  front: Front,
  assigned: readonly string[],
  moved: readonly FrontMove[],
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const ids = assigned.join(", ");
  const order = front.items.join(", ");
  return {
    status: "ok",
    header: headerOf(t("frentes", "fronts")),
    blocks: section(undefined, [
      t(`${ids} al frente ${front.name}.`, `${ids} to front ${front.name}.`),
      t(`Orden del frente ${front.name}: ${order}.`, `Order of front ${front.name}: ${order}.`),
      ...moved.map((move) =>
        t(
          `Ya no están en el frente ${move.front}: ${move.ids.join(", ")}.`,
          `No longer in front ${move.front}: ${move.ids.join(", ")}.`,
        ),
      ),
    ]),
    next: goOn(ctx),
  };
}

/** Why `front add` or `front assign` wrote nothing, and what to do instead. */
export function frontRefusalCard(refusal: FrontRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { reason, next } =
    refusal.reason === "unknown-front"
      ? unknownFrontTexts(refusal.name, ctx.command, t)
      : refusal.reason === "unknown" || refusal.reason === "not-work" || refusal.reason === "closed"
        ? assignRefusalTexts(refusal, ctx.command, t)
        : addRefusalTexts(refusal, ctx.command, t);
  return {
    status: "invalid",
    header: headerOf(t("frentes", "fronts")),
    blocks: section(undefined, [reason]),
    next,
  };
}

interface RefusalTexts {
  readonly reason: string;
  readonly next: string;
}

function addRefusalTexts(
  refusal: Exclude<FrontRefusal, AssignProblem | { readonly reason: "unknown-front" }>,
  command: string,
  t: Translate,
): RefusalTexts {
  switch (refusal.reason) {
    case "bad-name":
      return {
        reason: t(
          `«${refusal.name}» no vale como nombre de un frente: usa letras sin tilde, números, \`-\` o \`_\`, hasta 40.`,
          `«${refusal.name}» is not a valid front name: use letters without accents, digits, \`-\` or \`_\`, up to 40.`,
        ),
        next: t(
          `vuelve a ejecutar \`${command} front add <nombre> "<texto>"\`.`,
          `run \`${command} front add <name> "<text>"\` again.`,
        ),
      };
    case "exists": {
      const { name, text } = refusal.front;
      return {
        reason: t(
          `Ya hay un frente «${name}»: ${firstLine(text)}`,
          `There is already a front «${name}»: ${firstLine(text)}`,
        ),
        next: t(
          `elige otro nombre, o reparte en él con \`${command} front assign ${name} <id>…\`.`,
          `pick another name, or assign to it with \`${command} front assign ${name} <id>…\`.`,
        ),
      };
    }
    case "empty":
      return {
        reason: t("El texto del frente está vacío.", "The front's text is empty."),
        next: t(
          `di lo que abarca: \`${command} front add <nombre> "<texto>"\`.`,
          `say what it covers: \`${command} front add <name> "<text>"\`.`,
        ),
      };
  }
}

/** `front assign` named a front that does not exist. */
function unknownFrontTexts(name: string, command: string, t: Translate): RefusalTexts {
  return {
    reason: t(`No hay ningún frente «${name}».`, `There is no front «${name}».`),
    next: t(
      `\`${command} front\` los lista; crea uno con \`${command} front add\`.`,
      `\`${command} front\` lists them; create one with \`${command} front add\`.`,
    ),
  };
}

function assignRefusalTexts(refusal: AssignProblem, command: string, t: Translate): RefusalTexts {
  const again = t(
    `quítala de la lista y vuelve a ejecutar \`${command} front assign\`.`,
    `leave it out and run \`${command} front assign\` again.`,
  );
  switch (refusal.reason) {
    case "unknown":
      return {
        reason: t(`No hay ninguna entrada ${refusal.id}.`, `There is no entry ${refusal.id}.`),
        next: t(
          `\`${command} memory\` lista las abiertas.`,
          `\`${command} memory\` lists the open ones.`,
        ),
      };
    case "not-work": {
      const [es, en] = ONE_OF_KIND[refusal.entry.kind];
      return {
        reason: t(
          `Solo los pendientes y las mejoras van en un frente, y ${refusal.entry.id} es ${es}.`,
          `Only pending items and improvements go in a front, and ${refusal.entry.id} is ${en}.`,
        ),
        next: again,
      };
    }
    case "closed": {
      const { id, status } = refusal.entry;
      return {
        reason:
          status === "dropped"
            ? t(`${id} ya está descartada.`, `${id} is already dropped.`)
            : t(`${id} ya está hecha.`, `${id} is already done.`),
        next: again,
      };
    }
  }
}

/** The subject of the commit that adds front `name` or assigns `ids` to it. */
export function frontCommitSubject(
  operation: "add" | "assign",
  name: string,
  ids: readonly string[],
  lang: Lang,
): string {
  const t = translator(lang);
  return operation === "add"
    ? t(`memoria: frente ${name}`, `memory: front ${name}`)
    : t(
        `memoria: ${ids.join(", ")} al frente ${name}`,
        `memory: ${ids.join(", ")} to front ${name}`,
      );
}
