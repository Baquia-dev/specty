// SPDX-License-Identifier: Apache-2.0
import type { AgentTool } from "../agents";
import type { Phase } from "../flow/phases";
import { headerOf, type Output, section } from "../output";
import { leaveFolderNext } from "./land";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// How the agent waits for the person's decision with `specty wait`, in each tool. `flow.ts` uses
// `waitStep`, so this file builds its own blocked card instead of importing `blockedCard`.

/** How the agent of a tool runs a long command, in Spanish and in English. */
interface WaitHabit {
  readonly es: string;
  readonly en: string;
  /** The tool cuts a command that writes nothing for a while: `wait` writes a heartbeat line. */
  readonly beats?: true;
}

const FOREGROUND: WaitHabit = { es: "Ejecútalo en primer plano", en: "Run it in the foreground" };

/**
 * How each tool keeps `specty wait` alive while the person decides, measured on 2026-11-06. A tool
 * that cuts a command in the foreground has its agent run it again each time (`waitStep`).
 */
const WAIT_HABITS: Readonly<Record<AgentTool, WaitHabit>> = {
  // 2.1.318: Bash moves a command past its limit (120 s, 600 s at most) to the background, and
  // `run_in_background` tells the agent when it ends, with no model call while it waits.
  "claude-code": {
    es: "Ejecútalo en segundo plano (`run_in_background: true`), que te avisa al terminar,",
    en: "Run it in the background (`run_in_background: true`), which tells you when it ends,",
  },
  cursor: {
    es: "Ejecútalo en segundo plano (`block_until_ms: 0`), que te avisa al terminar,",
    en: "Run it in the background (`block_until_ms: 0`), which tells you when it ends,",
  },
  // OpenCode 2 has `background: true`, with no limit; OpenCode 1 kills a command at 120 s unless
  // its `timeout`, in milliseconds, says otherwise: an hour and a minute.
  opencode: {
    es: "Ejecútalo en segundo plano (`background: true`) o, en OpenCode 1, con `timeout: 3660000`,",
    en: "Run it in the background (`background: true`) or, in OpenCode 1, with `timeout: 3660000`,",
  },
  // agy 1.5.1: `run_command` goes to the background by itself within 10 s, and tells when it ends.
  antigravity: {
    es: "Ejecútalo y deja que pase a segundo plano, que te avisa al terminar,",
    en: "Run it and let it go to the background, which tells you when it ends,",
  },
  // 0.166: `exec_command` returns after 10 s with the process alive; an empty `write_stdin` polls it.
  codex: {
    es: "Si sigue en marcha, consulta su salida hasta que termine,",
    en: "If it is still running, poll its output until it ends,",
  },
  // Devin: it goes to the background and `get_output` reads it (not checked by hand).
  windsurf: {
    es: "Si pasa a segundo plano, consulta su salida con `get_output` hasta que termine,",
    en: "If it goes to the background, poll its output with `get_output` until it ends,",
  },
  // 0.67 kills a command that writes nothing for 300 s: `wait` writes a heartbeat line each minute.
  "gemini-cli": { ...FOREGROUND, beats: true },
  // Nothing measured, and no guard.
  copilot: FOREGROUND,
};

/** What the sentence of `specty wait` reads of an output's context: the guard's has no more. */
type WaitContext = Pick<CardContext, "lang" | "command" | "tool">;

/**
 * `specty wait` as the outputs that wait for the person ask for it: the same sentence in all of
 * them, in the agent's tool's way, with no final period so that each output closes it.
 */
export function waitStep(ctx: WaitContext): string {
  return waitWith(
    ctx,
    (wait) => `ejecuta ${wait}`,
    (wait) => `run ${wait}`,
  );
}

/** `waitStep`, with the verb that starts it in each language. */
function waitWith(
  ctx: WaitContext,
  es: (wait: string) => string,
  en: (wait: string) => string,
): string {
  const how = ctx.tool === undefined ? FOREGROUND : WAIT_HABITS[ctx.tool];
  const wait = `\`${ctx.command} wait\``;
  return translator(ctx.lang)(
    `${es(wait)} para esperar su decisión. ${how.es} y vuelve a ejecutarlo cada vez que se agote o se corte`,
    `${en(wait)} to wait for their decision. ${how.en} and run it again each time it times out or is cut off`,
  );
}

/** The wait command timed out before human action was completed: it runs again right away. */
export function waitTimeoutCard(id: string, timeoutSec: number, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const again = waitWith(
    ctx,
    (wait) => `vuelve a ejecutar ya ${wait}`,
    (wait) => `run ${wait} again right away`,
  );
  return {
    status: "blocked",
    header: headerOf(id),
    blocks: section(undefined, [
      t(
        `Tiempo de espera agotado (${timeoutSec}s) en ${id}: la persona aún no ha tomado una decisión. El estado del cambio no se ha modificado.`,
        `Wait timed out (${timeoutSec}s) on ${id}: the person has not taken a decision yet. The change's state was not modified.`,
      ),
    ]),
    next: t(
      `recuérdale a la persona la decisión pendiente y ${again}.`,
      `remind the person of the pending decision and ${again}.`,
    ),
  };
}

/** What `specty wait` read of a change whose folder went while it waited. */
interface GoneFolder {
  readonly id: string;
  /** The change's folder, which no longer exists. */
  readonly folder: string;
  /** The main folder, where the agent carries on. */
  readonly main: string;
  /** Its phase at the tip of its branch, when it could be read: `done` or `cancelled` once archived. */
  readonly phase?: Phase;
}

/**
 * `specty wait` whose change's folder went while it waited: the person closed the change (also
 * with the `accept` of a quick one) or cancelled it, and the agent leaves the folder as after a
 * closing from inside it; or the folder went with the change still open, and `restore` brings it
 * back from the main folder.
 */
export function waitFolderGoneCard(gone: GoneFolder, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { id, folder, main, phase } = gone;
  const ended = phase === "done" || phase === "cancelled";
  return {
    status: "ok",
    header: headerOf(id, phase),
    blocks: section(undefined, [goneLine(gone, t)]),
    next: ended
      ? leaveFolderNext({ folder, main, removed: true }, ctx)
      : t(
          `${folder} ya no existe: sal de ella (en Claude Code, \`ExitWorktree\`) y, en ${main}, recupera la carpeta con \`${ctx.command} restore ${id}\` y sigue su salida, que dice cómo volver a ella.`,
          `${folder} no longer exists: leave it (in Claude Code, \`ExitWorktree\`) and, in ${main}, bring the folder back with \`${ctx.command} restore ${id}\` and follow its output, which tells how to go back to it.`,
        ),
  };
}

/** What happened to the change whose folder went: closed, cancelled, or still open on its branch. */
function goneLine({ id, folder, phase }: GoneFolder, t: Translate): string {
  if (phase === "done") {
    return t(
      `La persona cerró ${id} mientras esperabas, y su carpeta ${folder} se eliminó.`,
      `The person closed ${id} while you waited, and its folder ${folder} was removed.`,
    );
  }
  if (phase === "cancelled") {
    return t(
      `La persona canceló ${id} mientras esperabas, y su carpeta ${folder} se eliminó.`,
      `The person cancelled ${id} while you waited, and its folder ${folder} was removed.`,
    );
  }
  return t(
    `La carpeta ${folder} de ${id} se eliminó mientras esperabas, sin cerrar ni cancelar el cambio, que sigue en su rama.`,
    `Folder ${folder} of ${id} was removed while you waited, without closing or cancelling the change, which is still on its branch.`,
  );
}

/**
 * The line `specty wait` writes while it waits for the person, in a tool that cuts a command that
 * writes nothing for a while (`beats`), with the minutes waited and its limit; nothing elsewhere.
 */
export function waitHeartbeat(
  id: string,
  waitedSec: number,
  timeoutSec: number,
  ctx: CardContext,
): string | undefined {
  if (ctx.tool === undefined || WAIT_HABITS[ctx.tool].beats !== true) return undefined;
  const waited = Math.floor(waitedSec / 60);
  const limit = Math.ceil(timeoutSec / 60);
  return `specty: ${translator(ctx.lang)(
    `sigue esperando la decisión de la persona en ${id} (${waited} de ${limit} min)…`,
    `still waiting for the person's decision on ${id} (${waited} of ${limit} min)…`,
  )}`;
}

/** Why the guard stops something, and the next step it gives instead. */
interface WaitDenial {
  readonly reason: string;
  readonly next: string;
}

/**
 * The guard's denial of `specty wait` in the foreground, for a tool that can run it in the
 * background (Claude Code): launching it again there, in the tool's way.
 */
export function foregroundWaitDenial(ctx: WaitContext): WaitDenial {
  const wait = `\`${ctx.command} wait\``;
  return {
    reason: translator(ctx.lang)(
      `${wait} espera la decisión de la persona, que puede tardar más que el límite de un comando en primer plano.`,
      `${wait} waits for the person's decision, which can take longer than the limit of a command in the foreground.`,
    ),
    next: `${waitWith(
      ctx,
      (command) => `lanza de nuevo ${command}`,
      (command) => `launch ${command} again`,
    )}.`,
  };
}

/**
 * The guard's denial of a command that only waits, with `program` (`sleep`, `caffeinate`…), while
 * change `id` waits for the person: `specty wait` in the tool's way, or `specty next` in
 * delegated mode, which tells whether the agent decides.
 */
export function waitCommandDenial(
  id: string,
  program: string,
  ctx: WaitContext & { readonly delegated?: boolean },
): WaitDenial {
  const t = translator(ctx.lang);
  return {
    reason: t(
      `El cambio ${id} espera la decisión de la persona: no se espera con \`${program}\`.`,
      `Change ${id} is waiting for the person's decision: do not wait with \`${program}\`.`,
    ),
    next:
      ctx.delegated === true
        ? t(
            `ejecuta \`${ctx.command} next\`, que te dice si decides tú o esperas a la persona.`,
            `run \`${ctx.command} next\`, which tells you whether you decide or wait for the person.`,
          )
        : `${waitStep(ctx)}.`,
  };
}
