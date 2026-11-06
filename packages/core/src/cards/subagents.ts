// SPDX-License-Identifier: Apache-2.0
import { AGENT_CAPABILITIES } from "../capabilities";
import { translator } from "./text";
import type { CardContext } from "./view";
import { waitStep } from "./wait";

/**
 * The pieces of the briefs a card hands to subagents, each one the text a subagent gets as is to
 * carry a change in its folder: an epic's slices (`epic.ts`).
 */

/** The tool hands work to subagents (ARCHITECTURE §10), and `subagents` lets it. */
export function toSubagents(ctx: CardContext): boolean {
  if (ctx.tool === undefined || ctx.subagents === false) return false;
  return AGENT_CAPABILITIES[ctx.tool].subagentSlices.state === "yes";
}

/**
 * How the tool launches each brief's subagent, when it needs saying: Antigravity's subagent works
 * in its slice's folder only with the workspace of the conversation that launches it.
 */
export function launchedWith(ctx: CardContext): string {
  if (ctx.tool !== "antigravity") return "";
  return translator(ctx.lang)(
    ' (en Antigravity, `invoke_subagent` con `Workspace: "inherit"`, no `branch`, que le daría una carpeta que no es la de su corte)',
    ' (in Antigravity, `invoke_subagent` with `Workspace: "inherit"`, not `branch`, which would give it a folder other than its slice\'s)',
  );
}

/**
 * A brief's steps once the change is entered: its commands in its folder, quoted as the guard
 * quotes it, so the command asked for is the one it takes; then `next` to the end, and the answer.
 */
export function inItsFolder(folder: string, ctx: CardContext): string[] {
  const t = translator(ctx.lang);
  const cd = `cd '${folder.replaceAll("'", `'\\''`)}' &&`;
  return [
    t(
      `Tu \`cd\` no dura entre comandos: empieza cada uno con \`${cd}\` y usa rutas absolutas de esa carpeta.`,
      `Your \`cd\` does not last between commands: start each one with \`${cd}\` and use absolute paths in that folder.`,
    ),
    t(
      `Sigue \`${ctx.command} next\` hasta cerrarlo; cuando espere a la persona, ${waitStep(ctx)}.`,
      `Follow \`${ctx.command} next\` until it is closed; when it waits for the person, ${waitStep(ctx)}.`,
    ),
    t(
      "Responde en tres líneas: el cambio, su fase y lo que falta.",
      "Answer in three lines: the change, its phase and what is left.",
    ),
  ];
}

export const numbered = (steps: readonly string[]): string[] =>
  steps.map((step, index) => `${index + 1}. ${step}`);
