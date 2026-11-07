// SPDX-License-Identifier: Apache-2.0
import { AGENT_CAPABILITIES } from "../capabilities";
import { translator } from "./text";
import type { CardContext } from "./view";
import { waitStep } from "./wait";

/**
 * The pieces of the briefs a card hands to subagents, each one the text a subagent gets as is to
 * carry a change in its folder: an epic's slices (`epic.ts`) and, with no change active, each
 * change the user asks for (`idle.ts`) and the orphan the user asks to resume (`rejoin.ts`).
 */

/** The tool hands work to subagents (ARCHITECTURE §10), and `subagents` lets it. */
export function toSubagents(ctx: CardContext): boolean {
  if (ctx.tool === undefined || ctx.subagents === false) return false;
  return AGENT_CAPABILITIES[ctx.tool].subagentSlices.state === "yes";
}

/**
 * How the tool launches each brief's subagent, when it needs saying: Antigravity's subagent works
 * in the folder of its slice, or of its change, only with the workspace of the conversation that
 * launches it.
 */
export function launchedWith(ctx: CardContext, of: "slice" | "change" = "slice"): string {
  if (ctx.tool !== "antigravity") return "";
  const t = translator(ctx.lang);
  const its = of === "slice" ? t("su corte", "its slice's") : t("su cambio", "its change's");
  return t(
    ` (en Antigravity, \`invoke_subagent\` con \`Workspace: "inherit"\`, no \`branch\`, que le daría una carpeta que no es la de ${its})`,
    ` (in Antigravity, \`invoke_subagent\` with \`Workspace: "inherit"\`, not \`branch\`, which would give it a folder other than ${its})`,
  );
}

/**
 * A brief's steps once the change is entered: its commands in its folder, quoted as the guard
 * quotes it, so the command asked for is the one it takes; then `next` to the end, the brief's
 * own steps (`more`), and the answer.
 */
export function inItsFolder(
  folder: string,
  ctx: CardContext,
  more: readonly string[] = [],
): string[] {
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
    ...more,
    t(
      "Responde en tres líneas: el cambio, su fase y lo que falta.",
      "Answer in three lines: the change, its phase and what is left.",
    ),
  ];
}

/** A brief's step for a change whose spec may be still to write: a question goes back to the session. */
export function questionStep(ctx: CardContext): string {
  return translator(ctx.lang)(
    "Si para la spec te falta una respuesta del usuario, no la supongas: detente y responde con la pregunta.",
    "If the spec needs an answer from the user, do not assume it: stop and answer with the question.",
  );
}

/**
 * A brief's step for a change that may come out too large for one: an epic's card asks to launch
 * subagents, which the brief forbids, so the main session makes the epic in the change.
 */
export function tooLargeStep(ctx: CardContext): string {
  return translator(ctx.lang)(
    "Si `propose` dice que el cambio es demasiado grande y pide dividirlo en una épica, no lo conviertas tú: detente y responde con eso, que la épica la hace la sesión principal en tu cambio.",
    "If `propose` says the change is too large and asks to split it into an epic, do not turn it into one yourself: stop and answer with that, since the main session makes the epic in your change.",
  );
}

export const numbered = (steps: readonly string[]): string[] =>
  steps.map((step, index) => `${index + 1}. ${step}`);
