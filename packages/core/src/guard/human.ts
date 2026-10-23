// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";

/**
 * Subcommands only a person may run (ARCHITECTURE §4, invariant). In delegated mode, which only
 * the person turns on (ADR 0010), the agent runs them on the person's behalf.
 */
export const HUMAN_COMMANDS: ReadonlySet<string> = new Set([
  "approve",
  "accept",
  "close",
  "cancel",
  "reject",
]);

/** Subcommands no delegation opens: only the person turns delegated mode on or off. */
const PERSON_ONLY: ReadonlySet<string> = new Set(["delegate"]);

export interface HumanContext {
  readonly lang: Lang;
  /** How messages tell the agent to call Specty, for example `specty`. */
  readonly command: string;
  /** The person delegated their decisions to the agent. */
  readonly delegated?: boolean;
}

/**
 * Why the agent may not run one of the person's subcommands. Undefined when it runs none, or when
 * the person delegated them all, which never covers `delegate` itself.
 */
export function humanDenial(
  specty: readonly string[],
  ctx: HumanContext,
): { readonly reason: string; readonly next: string } | undefined {
  const human = specty.find(
    (name) => PERSON_ONLY.has(name) || (HUMAN_COMMANDS.has(name) && ctx.delegated !== true),
  );
  if (human === undefined) return undefined;
  const t = (es: string, en: string) => (ctx.lang === "es" ? es : en);
  return {
    reason: t(
      `\`${ctx.command} ${human}\` lo ejecuta el usuario en su terminal, no el agente.`,
      `\`${ctx.command} ${human}\` is run by the user in their terminal, not by the agent.`,
    ),
    next: t(
      "pídele al usuario que lo ejecute y termina tu turno.",
      "ask the user to run it and end your turn.",
    ),
  };
}
