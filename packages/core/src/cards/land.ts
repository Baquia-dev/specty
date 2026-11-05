// SPDX-License-Identifier: Apache-2.0
import { AGENT_CAPABILITIES } from "../capabilities";
import type { Lang } from "../i18n";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// Landing a closed change on the main branch, and leaving its folder (ARCHITECTURE §9).

export function landedLine(target: string, lang: Lang): string {
  return translator(lang)(`Incorporado a ${target}.`, `Merged into ${target}.`);
}

/** The main branch did not move to the change: `failure` says why. */
export function notLandedLine(target: string, failure: string, lang: Lang): string {
  return translator(lang)(`${target} no avanzó: ${failure}`, `${target} did not move: ${failure}`);
}

/** Why the main branch, checked out nowhere, cannot move: someone added commits to it. */
export function targetAheadLine(lang: Lang): string {
  return translator(lang)(
    "ya tiene commits que el cambio no incluye.",
    "it already has commits the change does not include.",
  );
}

/** The main folder, where the change lived, is back on the main branch. */
export function backOnTargetLine(target: string, lang: Lang): string {
  return translator(lang)(`Esta carpeta vuelve a ${target}.`, `This folder is back on ${target}.`);
}

export function folderRemovedLine(
  folder: string,
  branch: string,
  main: string,
  lang: Lang,
): string {
  return translator(lang)(
    `La carpeta ${folder} se eliminó y la rama ${branch} queda; sigue en ${main}.`,
    `Folder ${folder} was removed and branch ${branch} stays; carry on in ${main}.`,
  );
}

/** The change's folder could not be removed: `failure` is git's last line. */
export function folderStaysLine(folder: string, failure: string, lang: Lang): string {
  return translator(lang)(
    `La carpeta ${folder} queda: ${failure} Bórrala con \`git worktree remove\` cuando ya no la necesites.`,
    `Folder ${folder} stays: ${failure} Remove it with \`git worktree remove\` when you no longer need it.`,
  );
}

/** The change is closed but did not reach the main branch: closing again retries only that. */
export function retryLandingNext(ctx: CardContext): string {
  return translator(ctx.lang)(
    `cuando se pueda, vuelve a ejecutar \`${ctx.command} close\` para incorporarlo.`,
    `when possible, run \`${ctx.command} close\` again to merge it.`,
  );
}

/** The open epic the conversation that closed one of its slices goes back to (ARCHITECTURE §10). */
interface EpicToRejoin {
  readonly id: string;
  /** Absolute path of the epic's folder. */
  readonly folder: string;
  /** That folder is the main one. */
  readonly inMain: boolean;
  /** Claude Code enters a change's folder by name: Specty's worktree hooks are installed. */
  readonly byName: boolean;
}

/** The change's folder the agent closed from inside, and the epic it goes back to after a slice. */
interface LeftFolder {
  readonly folder: string;
  readonly main: string;
  readonly removed: boolean;
  readonly epic?: EpicToRejoin;
}

/**
 * The agent that closed works inside the change's folder: it leaves it for the main one, or, when
 * the change was a slice its conversation carried, for the epic, which it names.
 */
export function leaveFolderNext(left: LeftFolder, ctx: CardContext): string {
  const t = translator(ctx.lang);
  const leave = left.removed
    ? t(`${left.folder} ya no existe: sal de ella`, `${left.folder} no longer exists: leave it`)
    : t(`sal de ${left.folder}`, `leave ${left.folder}`);
  if (left.epic !== undefined) return rejoinEpicNext(leave, left.main, left.epic, ctx, t);
  return t(
    `${leave} (en Claude Code, \`ExitWorktree\`) y sigue en ${left.main}; para otro cambio, \`${ctx.command} new "<título>"\`.`,
    `${leave} (in Claude Code, \`ExitWorktree\`) and carry on in ${left.main}; for another change, \`${ctx.command} new "<title>"\`.`,
  );
}

/**
 * Back to the epic once its slice closed: a tool that enters folders with `specty enter` goes back
 * with it; Claude Code leaves the slice's folder without removing anything (`action: "keep"`) and
 * enters the epic's by name, or switches its folder there; in the main folder, where it goes back
 * anyway, it carries on with the epic.
 */
function rejoinEpicNext(
  leave: string,
  main: string,
  epic: EpicToRejoin,
  ctx: CardContext,
  t: Translate,
): string {
  const { id, folder } = epic;
  const { tool } = ctx;
  if (
    !epic.inMain &&
    tool !== undefined &&
    AGENT_CAPABILITIES[tool].worktreeByName.state === "indirect"
  ) {
    return t(
      `${leave} y vuelve a la épica ${id}, en ${folder}: ejecuta \`${ctx.command} enter ${id}\` y sigue su salida.`,
      `${leave} and go back to epic ${id}, in ${folder}: run \`${ctx.command} enter ${id}\` and follow its output.`,
    );
  }
  const exit = t(
    `${leave} (en Claude Code, \`ExitWorktree\` con \`action: "keep"\`)`,
    `${leave} (in Claude Code, \`ExitWorktree\` with \`action: "keep"\`)`,
  );
  const next = `\`${ctx.command} next\``;
  if (epic.inMain) {
    return t(
      `${exit} y sigue con la épica ${id} en ${main}: ejecuta ${next}.`,
      `${exit} and carry on with epic ${id} in ${main}: run ${next}.`,
    );
  }
  const how = epic.byName
    ? t(
        `en Claude Code, \`EnterWorktree\` con \`name: "${id}"\`, y ejecuta ${next}`,
        `in Claude Code, \`EnterWorktree\` with \`name: "${id}"\`, and run ${next}`,
      )
    : t(
        `cambia allí la carpeta de trabajo de tu sesión o abre allí un agente, y ejecuta ${next}`,
        `switch your session's working folder there or open an agent there, and run ${next}`,
      );
  return t(
    `${exit} y vuelve a la épica ${id}, en ${folder}: ${how}.`,
    `${exit} and go back to epic ${id}, in ${folder}: ${how}.`,
  );
}

/** What `git.afterLanding` did once the change landed: its command, the folder, how it ended. */
export interface AfterLanding {
  readonly command: string;
  readonly folder: string;
  readonly ok: boolean;
  /** The last line it printed, when it failed. */
  readonly last?: string;
}

/** The line of the closing with what `git.afterLanding` did. */
export function afterLandingLine(after: AfterLanding, lang: Lang): string {
  const t = translator(lang);
  const { command, folder } = after;
  if (after.ok)
    return t(
      `Tras incorporarlo, \`${command}\` pasó en ${folder}.`,
      `After merging it, \`${command}\` passed in ${folder}.`,
    );
  const last = after.last === undefined || after.last === "" ? "" : ` (${after.last})`;
  return t(
    `Tras incorporarlo, \`${command}\` falló en ${folder}${last}; el cambio ya está incorporado: corrígelo y vuelve a ejecutarlo allí.`,
    `After merging it, \`${command}\` failed in ${folder}${last}; the change is already merged: fix it and run it there again.`,
  );
}

/** While `git.afterLanding` runs, on the error output. */
export function landingNote(command: string, lang: Lang): string {
  return translator(lang)(
    `specty: tras incorporarlo, ejecutando \`${command}\`…`,
    `specty: after merging it, running \`${command}\`…`,
  );
}
