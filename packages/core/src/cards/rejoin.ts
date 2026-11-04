// SPDX-License-Identifier: Apache-2.0
import { AGENT_CAPABILITIES } from "../capabilities";
import type { Phase } from "../flow/phases";
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { carryOnText } from "./new";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

/** The open change of another folder that the conversation asking `next` is bound to. */
export interface OwnChangeView {
  readonly id: string;
  readonly title: string;
  /** Absolute path of the change's folder. */
  readonly folder: string;
  /** The folder is gone and the change is still on its branch: `specty restore` brings it back. */
  readonly lost?: boolean;
}

/** An open change whose folder is gone, read from its branch (`specty restore`). */
export interface LostView {
  readonly id: string;
  readonly title: string;
  readonly phase: Phase;
}

/** An open change that waits for the agent and that no conversation holds (`status`'s orphan). */
export interface OrphanView {
  readonly id: string;
  readonly title: string;
  readonly phase: Phase;
  /** Where it lives, relative to the folder `next` runs in. */
  readonly folder: string;
}

/**
 * `next` for a conversation outside the folder of its open change: it goes back there, the way
 * `specty new` told it to go in, instead of creating another change.
 */
export function rejoinCard(own: OwnChangeView, byName: boolean, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const where =
    own.lost === true
      ? t(
          `Esta conversación trabaja en el cambio ${own.id} («${own.title}»), cuya carpeta ${own.folder} se perdió; el cambio sigue en su rama.`,
          `This conversation works on change ${own.id} («${own.title}»), whose folder ${own.folder} was lost; the change is still on its branch.`,
        )
      : t(
          `Esta conversación trabaja en el cambio ${own.id} («${own.title}»), en ${own.folder}, y ahora está fuera de esa carpeta.`,
          `This conversation works on change ${own.id} («${own.title}»), in ${own.folder}, and is now outside that folder.`,
        );
  return {
    status: "ok",
    header: headerOf(),
    blocks: section(t("TU CAMBIO", "YOUR CHANGE"), [
      where,
      t(
        "No crees otro cambio para seguir con este: una sesión trabaja un solo cambio a la vez, y otro trabajo va en otra sesión.",
        "Do not create another change to carry on with this one: a session works on one change at a time, and other work goes in another session.",
      ),
    ]),
    next: rejoinNext(own, byName, ctx, t),
  };
}

/** Going back to the change's folder, or bringing it back first when it was lost. */
function rejoinNext(own: OwnChangeView, byName: boolean, ctx: CardContext, t: Translate): string {
  if (own.lost === true) {
    const restore = `\`${ctx.command} restore ${own.id}\``;
    return t(
      `recupera la carpeta con ${restore} y sigue su salida, que dice cómo volver a ella.`,
      `bring the folder back with ${restore} and follow its output, which tells how to go back to it.`,
    );
  }
  const carryOn = carryOnText({ ...own, byName, agent: ctx.tool }, ctx, t);
  return t(`vuelve a ${own.folder}: ${carryOn}`, `go back to ${own.folder}: ${carryOn}`);
}

/** The open changes whose folder is gone, and how to bring one back instead of a new change. */
export function lostBlock(lost: readonly LostView[], ctx: CardContext): OutputBlock[] {
  if (lost.length === 0) return [];
  const t = translator(ctx.lang);
  const restore = `\`${ctx.command} restore <id>\``;
  return section(t("CAMBIOS SIN CARPETA", "CHANGES WITHOUT THEIR FOLDER"), [
    ...lost.map((change) => `${change.id} · ${change.phase} — ${change.title}`),
    t(
      `Si el usuario pide seguir uno de ellos, recupera su carpeta con ${restore} en lugar de crear otro cambio.`,
      `If the user asks to carry on with one of them, bring its folder back with ${restore} instead of creating another change.`,
    ),
  ]);
}

/** The open changes no conversation holds, each with its folder, and how to resume one of them. */
export function orphansBlock(
  orphans: readonly OrphanView[],
  byName: boolean,
  ctx: CardContext,
): OutputBlock[] {
  if (orphans.length === 0) return [];
  const t = translator(ctx.lang);
  const how = resumeHow(byName, ctx, t);
  return section(t("CAMBIOS SIN CONVERSACIÓN", "CHANGES NO CONVERSATION HOLDS"), [
    ...orphans.map(
      (orphan) =>
        `${orphan.id} · ${orphan.phase} — ${orphan.title} · ${t("en", "in")} ${orphan.folder}`,
    ),
    t(
      `Si el usuario pide seguir uno de ellos, retómalo en su carpeta en lugar de crear otro cambio: ${how}.`,
      `If the user asks to carry on with one of them, resume it in its folder instead of creating another change: ${how}.`,
    ),
  ]);
}

/** How the agent that asks gets into a change's folder, for any change (`<id>`). */
function resumeHow(byName: boolean, ctx: CardContext, t: Translate): string {
  const { tool } = ctx;
  if (tool !== undefined && AGENT_CAPABILITIES[tool].worktreeByName.state === "indirect") {
    return `\`${ctx.command} enter <id>\``;
  }
  return byName
    ? t(
        'en Claude Code, `EnterWorktree` con `name: "<id>"`',
        'in Claude Code, `EnterWorktree` with `name: "<id>"`',
      )
    : t(
        "cambia allí la carpeta de trabajo de tu sesión o abre allí un agente",
        "switch your session's working folder there or open an agent there",
      );
}
