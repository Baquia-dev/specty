// SPDX-License-Identifier: Apache-2.0
import type { AgentTool } from "../agents";
import { headerOf, type Output, section } from "../output";
import { translator } from "./text";
import type { CardContext } from "./view";

// How the agent waits for the person's decision with `specty wait`, in each tool. `flow.ts` uses
// `waitStep`, so this file builds its own blocked card instead of importing `blockedCard`.

/** How the agent of a tool runs a long command, in Spanish and in English. */
interface WaitHabit {
  readonly es: string;
  readonly en: string;
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
  // 0.67 kills a command that writes nothing for 300 s.
  "gemini-cli": FOREGROUND,
  // Nothing measured, and no guard.
  copilot: FOREGROUND,
};

/**
 * `specty wait` as the outputs that wait for the person ask for it: the same sentence in all of
 * them, in the agent's tool's way, with no final period so that each output closes it.
 */
export function waitStep(ctx: CardContext): string {
  return waitWith(
    ctx,
    (wait) => `ejecuta ${wait}`,
    (wait) => `run ${wait}`,
  );
}

/** `waitStep`, with the verb that starts it in each language. */
function waitWith(
  ctx: CardContext,
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
