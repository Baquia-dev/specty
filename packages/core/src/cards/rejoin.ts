// SPDX-License-Identifier: Apache-2.0
import { AGENT_CAPABILITIES } from "../capabilities";
import type { Phase } from "../flow/phases";
import { headerOf, type Output, type OutputBlock, section } from "../output";
import type { ChangeKind } from "../spec/model";
import { awayEpicCard } from "./epic";
import { carryOnText } from "./new";
import {
  inItsFolder,
  launchedWith,
  numbered,
  questionStep,
  tooLargeStep,
  toSubagents,
} from "./subagents";
import { type Translate, translator } from "./text";
import type { CardContext, ChangeView } from "./view";

/** The open change of another folder that the conversation asking `next` is bound to. */
export interface OwnChangeView {
  readonly id: string;
  readonly title: string;
  /** Absolute path of the change's folder. */
  readonly folder: string;
  /** The folder is gone and the change is still on its branch: `specty restore` brings it back. */
  readonly lost?: boolean;
  /** The change's view, when it is an approved epic: its card can be seen from outside its folder. */
  readonly epic?: ChangeView;
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
  /** An epic goes to the session itself, never to a subagent: its card launches subagents. */
  readonly kind?: ChangeKind;
}

/**
 * `next` for a conversation outside the folder of its open change: it goes back there, the way
 * `specty new` told it to go in, instead of creating another change. An epic that hands its slices
 * to subagents is the exception while some slice is left for them: its card comes here, since its
 * subagents can write in their slices' folders only from outside the epic's (ARCHITECTURE §10).
 */
export function rejoinCard(own: OwnChangeView, byName: boolean, ctx: CardContext): Output {
  const away = own.epic === undefined ? undefined : awayEpicCard(own.epic, own.folder, ctx);
  if (away !== undefined) return away;
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

/**
 * The open changes no conversation holds, each with its folder, and how to resume one of them:
 * with subagents, one of them resumes it with its brief, since entering its folder would isolate
 * the subagents already at work (in Claude Code); without them, the session goes in. An epic is
 * the exception: its card asks to launch subagents, which the brief forbids, so the session
 * resumes it itself once the subagents at work finish.
 */
export function orphansBlock(
  orphans: readonly OrphanView[],
  byName: boolean,
  ctx: CardContext,
): OutputBlock[] {
  if (orphans.length === 0) return [];
  const t = translator(ctx.lang);
  const subagents = toSubagents(ctx);
  const briefed = subagents && orphans.some((orphan) => orphan.kind !== "epic");
  const epics = subagents && orphans.some((orphan) => orphan.kind === "epic");
  return [
    ...section(t("CAMBIOS SIN CONVERSACIÓN", "CHANGES NO CONVERSATION HOLDS"), [
      ...orphans.map((orphan) => orphanLine(orphan, t)),
      ...(subagents
        ? []
        : [
            t(
              `Si el usuario pide seguir uno de ellos, retómalo en su carpeta en lugar de crear otro cambio: ${resumeHow(byName, ctx, t)}.`,
              `If the user asks to carry on with one of them, resume it in its folder instead of creating another change: ${resumeHow(byName, ctx, t)}.`,
            ),
          ]),
      ...(briefed
        ? [
            t(
              `Si el usuario pide seguir uno de ellos, no crees otro cambio ni entres en su carpeta: lanza un subagente con el encargo para retomarlo tal cual${launchedWith(ctx, "change")}, con su id en lugar de \`<id>\`.`,
              `If the user asks to carry on with one of them, do not create another change nor enter its folder: launch a subagent with the brief to resume it as is${launchedWith(ctx, "change")}, with its id in place of \`<id>\`.`,
            ),
          ]
        : []),
      ...(epics
        ? [
            t(
              `Una épica no va a un subagente, que no podría lanzar los subagentes de sus cortes: si el usuario pide seguirla, retómala tú en su carpeta en lugar de crear otro cambio, cuando terminen los subagentes que estén trabajando: ${resumeHow(byName, ctx, t)}.`,
              `An epic does not go to a subagent, which could not launch the subagents of its slices: if the user asks to carry on with it, resume it yourself in its folder instead of creating another change, once the subagents at work finish: ${resumeHow(byName, ctx, t)}.`,
            ),
          ]
        : []),
    ]),
    ...(briefed ? resumeBrief(ctx) : []),
  ];
}

/** An orphan's line: its id, phase, whether it is an epic, title and folder. */
function orphanLine(orphan: OrphanView, t: Translate): string {
  const epic = orphan.kind === "epic" ? ` · ${t("épica", "epic")}` : "";
  return `${orphan.id} · ${orphan.phase}${epic} — ${orphan.title} · ${t("en", "in")} ${orphan.folder}`;
}

/**
 * The brief a subagent gets as is to resume an orphan, the session putting its id in `<id>`: the
 * one of an epic's orphaned slice (`epic.ts`), with the question of a spec still to write and the
 * stop of a change too large for one, as the brief of a new change (`idle.ts`).
 */
function resumeBrief(ctx: CardContext): OutputBlock[] {
  const t = translator(ctx.lang);
  return section(t("ENCARGO PARA RETOMAR", "BRIEF TO RESUME"), [
    t(
      "Retoma el cambio <id> hasta su cierre, sin lanzar otros subagentes:",
      "Resume change <id> until it is closed, without launching other subagents:",
    ),
    ...numbered([
      `\`${ctx.command} enter <id>\``,
      ...inItsFolder(t("<carpeta del cambio>", "<change folder>"), ctx, [
        questionStep(ctx),
        tooLargeStep(ctx),
      ]),
    ]),
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
