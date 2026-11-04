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
  const carryOn = carryOnText({ ...own, byName, agent: ctx.tool }, ctx, t);
  return {
    status: "ok",
    header: headerOf(),
    blocks: section(t("TU CAMBIO", "YOUR CHANGE"), [
      t(
        `Esta conversación trabaja en el cambio ${own.id} («${own.title}»), en ${own.folder}, y ahora está fuera de esa carpeta.`,
        `This conversation works on change ${own.id} («${own.title}»), in ${own.folder}, and is now outside that folder.`,
      ),
      t(
        "No crees otro cambio para seguir con este: una sesión trabaja un solo cambio a la vez, y otro trabajo va en otra sesión.",
        "Do not create another change to carry on with this one: a session works on one change at a time, and other work goes in another session.",
      ),
    ]),
    next: t(`vuelve a ${own.folder}: ${carryOn}`, `go back to ${own.folder}: ${carryOn}`),
  };
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
